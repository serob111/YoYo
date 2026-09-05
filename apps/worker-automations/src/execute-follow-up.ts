import type { PrismaClient } from "@yoyo/database";

export type ExecuteFollowUpResult = "sent" | "skipped" | "not_found" | "failed";

interface SendMessageConfig {
  text: string;
}

interface CreateTaskConfig {
  title: string;
  description?: string | null;
}

/**
 * Exported as a plain function (not tied to BullMQ), same reason as every
 * other worker's handler: the entrypoint and tests both call it directly. The
 * atomic claim is PENDING -> SENDING via updateMany (mirrors
 * sendPendingMessage's PENDING -> SENDING claim in worker-messaging) - a
 * second concurrent call sees 0 rows affected and backs off as "skipped."
 */
export async function executeFollowUp(prisma: PrismaClient, followUpId: string): Promise<ExecuteFollowUpResult> {
  const claimed = await prisma.followUp.updateMany({
    where: { id: followUpId, status: "PENDING" },
    data: { status: "SENDING" }
  });
  if (claimed.count === 0) return "skipped";

  const followUp = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!followUp) return "not_found";

  const lead = await prisma.lead.findUnique({ where: { id: followUp.leadId } });
  if (!lead) {
    await prisma.followUp.update({ where: { id: followUpId }, data: { status: "FAILED", errorMessage: "Lead no longer exists" } });
    return "failed";
  }

  try {
    if (followUp.actionType === "SEND_MESSAGE") {
      const config = followUp.actionConfig as unknown as SendMessageConfig;
      await prisma.$transaction(async (tx) => {
        const conversation = lead.sourceConversationId
          ? await tx.conversation.findUnique({ where: { id: lead.sourceConversationId } })
          : null;
        if (!conversation) throw new Error("Lead has no source conversation to send the follow-up message into");

        const message = await tx.message.create({
          data: {
            organizationId: followUp.organizationId,
            conversationId: conversation.id,
            connectedAccountId: conversation.connectedAccountId,
            provider: conversation.provider,
            direction: "OUTBOUND",
            senderType: "AUTOMATION",
            messageType: "TEXT",
            text: config.text,
            status: "PENDING"
          }
        });
        await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

        // Inlined rather than importing apps/api's OutboxService - reuses the
        // exact existing outbound-send pipeline unchanged, same as worker-ai.
        await tx.outboxEvent.create({
          data: {
            organizationId: followUp.organizationId,
            aggregateType: "Message",
            aggregateId: message.id,
            eventType: "message.outbound_pending",
            payload: { requestId: "worker-automations" }
          }
        });

        await tx.activity.create({
          data: {
            organizationId: followUp.organizationId,
            leadId: lead.id,
            type: "SYSTEM",
            content: `Follow-up sent: ${config.text}`
          }
        });

        await tx.followUp.update({ where: { id: followUpId }, data: { status: "SENT", executedAt: new Date() } });
      });
    } else {
      const config = followUp.actionConfig as unknown as CreateTaskConfig;
      await prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: {
            organizationId: followUp.organizationId,
            leadId: lead.id,
            title: config.title,
            description: config.description ?? null
          }
        });
        await tx.activity.create({
          data: {
            organizationId: followUp.organizationId,
            leadId: lead.id,
            type: "SYSTEM",
            content: `Follow-up task created: ${config.title}`
          }
        });
        await tx.followUp.update({ where: { id: followUpId }, data: { status: "SENT", executedAt: new Date() } });
      });
    }
    return "sent";
  } catch (error) {
    await prisma.followUp.update({
      where: { id: followUpId },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error) }
    });
    return "failed";
  }
}
