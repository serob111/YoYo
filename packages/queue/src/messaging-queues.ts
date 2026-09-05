import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const WEBHOOK_EVENTS_QUEUE_NAME = "webhook-events";
export const OUTBOUND_MESSAGES_QUEUE_NAME = "outbound-messages";

export interface WebhookEventJobData {
  providerWebhookEventId: string;
  requestId: string;
}

export interface OutboundMessageJobData {
  messageId: string;
  requestId: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 3_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createWebhookEventsQueue(connection: Redis): Queue<WebhookEventJobData> {
  return new Queue<WebhookEventJobData>(WEBHOOK_EVENTS_QUEUE_NAME, { connection });
}

export function createOutboundMessagesQueue(connection: Redis): Queue<OutboundMessageJobData> {
  return new Queue<OutboundMessageJobData>(OUTBOUND_MESSAGES_QUEUE_NAME, { connection });
}

// BullMQ rejects custom job IDs containing ':' (reserved for its own key
// namespacing), so use '__' as the separator instead.
export async function enqueueWebhookEvent(queue: Queue<WebhookEventJobData>, data: WebhookEventJobData): Promise<void> {
  // Idempotent by construction: jobId = the ProviderWebhookEvent's own id, which
  // is already unique-constrained at the DB layer (provider, externalEventId).
  await queue.add("normalize", data, { ...DEFAULT_JOB_OPTIONS, jobId: `webhook__${data.providerWebhookEventId}` });
}

export async function enqueueOutboundMessage(queue: Queue<OutboundMessageJobData>, data: OutboundMessageJobData): Promise<void> {
  await queue.add("send", data, { ...DEFAULT_JOB_OPTIONS, jobId: `message__${data.messageId}` });
}
