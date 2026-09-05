import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@yoyo/database";
import { dedupeKeyFor, type InstagramWebhookPayload } from "@yoyo/integrations";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { RequestContext } from "../common/request-context";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  /**
   * Stores one ProviderWebhookEvent per inner messaging event (not one per HTTP
   * POST - Meta batches multiple entries/events per delivery), each wrapped back
   * into a single-event payload so worker-webhooks can normalize it with the
   * exact same @yoyo/integrations parser used here. The unique constraint on
   * (provider, externalEventId) is what makes a retried delivery a no-op - see
   * docs/architecture/queue-topology.md.
   */
  async ingest(payload: InstagramWebhookPayload): Promise<{ stored: number; deduped: number }> {
    let stored = 0;
    let deduped = 0;
    const requestId = RequestContext.current()?.requestId ?? "webhook";

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (!event.message) continue; // not a message-carrying event - out of scope for Phase 2

        const externalEventId = dedupeKeyFor(entry, event);
        const singleEventPayload: InstagramWebhookPayload = {
          object: "instagram",
          entry: [{ id: entry.id, time: entry.time, messaging: [event] }]
        };

        try {
          await this.prisma.client.$transaction(async (tx) => {
            const connectedAccount = await tx.connectedAccount.findUnique({
              where: { provider_externalAccountId: { provider: "INSTAGRAM", externalAccountId: entry.id } }
            });

            const row = await tx.providerWebhookEvent.create({
              data: {
                provider: "INSTAGRAM",
                externalEventId,
                connectedAccountId: connectedAccount?.id,
                organizationId: connectedAccount?.organizationId,
                payload: singleEventPayload as unknown as Prisma.InputJsonValue,
                status: connectedAccount ? "RECEIVED" : "IGNORED"
              }
            });

            if (connectedAccount) {
              await tx.connectedAccount.update({ where: { id: connectedAccount.id }, data: { lastWebhookAt: new Date() } });
              await this.outbox.record(tx, {
                organizationId: connectedAccount.organizationId,
                aggregateType: "ProviderWebhookEvent",
                aggregateId: row.id,
                eventType: "webhook.received",
                payload: { requestId }
              });
            } else {
              this.logger.warn(`Webhook event for unknown Instagram account ${entry.id} - stored as IGNORED`);
            }
          });
          stored += 1;
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            deduped += 1;
            continue;
          }
          throw error;
        }
      }
    }

    return { stored, deduped };
  }
}
