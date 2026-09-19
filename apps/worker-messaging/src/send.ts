import type { PrismaClient } from "@yoyo/database";
import type { TokenEncryptionService } from "@yoyo/crypto";
import { ProviderApiError, type MessagingProvider } from "@yoyo/integrations";

export type SendResult = "sent" | "failed" | "skipped" | "not_found";

/**
 * Exported as a plain function (not tied to BullMQ) so both the worker
 * entrypoint and integration tests can call it directly - the mocked-provider
 * tests exercise every failure category through this function.
 */
export async function sendPendingMessage(
  prisma: PrismaClient,
  tokenEncryption: TokenEncryptionService,
  messagingProvider: MessagingProvider,
  messageId: string
): Promise<SendResult> {
  // Atomic claim, same pattern as normalizeWebhookEvent: only one caller can
  // move PENDING -> SENDING for a given message.
  const claimed = await prisma.message.updateMany({ where: { id: messageId, status: "PENDING" }, data: { status: "SENDING" } });
  if (claimed.count === 0) {
    return "skipped";
  }

  const message = await prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message) {
    return "not_found";
  }

  const connectedAccount = await prisma.connectedAccount.findUnique({ where: { id: message.connectedAccountId } });
  if (!connectedAccount || connectedAccount.status !== "CONNECTED") {
    await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
    return "failed";
  }

  // We know the conversation's contactId, not the identity id directly, so
  // look up by contactId rather than the (provider, connectedAccountId,
  // externalId) compound key used elsewhere.
  const identity = await prisma.contactIdentity.findFirst({
    where: { contactId: message.conversation.contactId, provider: connectedAccount.provider, connectedAccountId: connectedAccount.id }
  });

  if (!identity) {
    await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
    return "failed";
  }

  const accessToken = tokenEncryption.decrypt(connectedAccount.encryptedAccessToken);

  try {
    const result = await messagingProvider.sendText(
      { externalAccountId: connectedAccount.externalAccountId, accessToken },
      identity.externalId,
      message.text ?? ""
    );
    await prisma.message.update({ where: { id: messageId }, data: { status: "SENT", providerMessageId: result.providerMessageId } });
    return "sent";
  } catch (error) {
    return handleSendFailure(prisma, messageId, connectedAccount.id, error);
  }
}

async function handleSendFailure(prisma: PrismaClient, messageId: string, connectedAccountId: string, error: unknown): Promise<SendResult> {
  if (!(error instanceof ProviderApiError)) {
    // Unclassified error (e.g. a bug) - let BullMQ retry with backoff rather
    // than silently swallowing it.
    await prisma.message.update({ where: { id: messageId }, data: { status: "PENDING" } });
    throw error;
  }

  switch (error.category) {
    case "RETRYABLE":
      // Revert to PENDING so the next BullMQ retry attempt (same jobId) can
      // re-claim this row, then re-throw so BullMQ actually schedules a retry.
      await prisma.message.update({ where: { id: messageId }, data: { status: "PENDING" } });
      throw error;

    case "ACTION_REQUIRED":
      await prisma.$transaction([
        prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } }),
        prisma.connectedAccount.update({
          where: { id: connectedAccountId },
          data: { status: "ACTION_REQUIRED", lastErrorCode: String(error.providerErrorCode ?? error.httpStatus ?? ""), lastErrorAt: new Date() }
        })
      ]);
      return "failed";

    case "NON_RETRYABLE":
      await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
      return "failed";

    case "REQUIRES_RECONCILIATION":
      // Ambiguous outcome (e.g. timeout after the request may have already
      // reached Meta) - never blindly resend a customer-facing message.
      // Terminal FAILED + flagged for manual review is the conservative choice.
      await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED", metadata: { requiresReconciliation: true } } });
      return "failed";

    default: {
      const exhaustiveCheck: never = error.category;
      throw new Error(`Unknown provider failure category: ${exhaustiveCheck}`);
    }
  }
}
