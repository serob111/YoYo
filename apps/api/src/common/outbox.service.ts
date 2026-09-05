import { Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@yoyo/database";

export type OutboxEventType =
  | "webhook.received"
  | "message.outbound_pending"
  | "message.inbound_received"
  | "knowledge_chunk.embedding_pending"
  | "lead.created"
  | "lead.stage_changed";

export interface RecordOutboxEventInput {
  organizationId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  /**
   * Always call within the same transaction as the business row it announces
   * (e.g. the ProviderWebhookEvent insert, or the outbound Message insert) -
   * that's what makes the outbox pattern actually solve "DB commit succeeds,
   * enqueue fails". See docs/adr/0004-transactional-outbox-deferred-to-phase-2.md.
   */
  async record(tx: Prisma.TransactionClient | PrismaClient, input: RecordOutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue
      }
    });
  }
}
