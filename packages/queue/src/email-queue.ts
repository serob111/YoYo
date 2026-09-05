import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const EMAIL_QUEUE_NAME = "email";

export type EmailTemplate = "MAGIC_LINK" | "ORGANIZATION_INVITE" | "PASSWORD_RESET" | "EMAIL_VERIFICATION";

export interface EmailJobData {
  template: EmailTemplate;
  to: string;
  organizationId?: string;
  requestId: string;
  data: Record<string, string>;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createEmailQueue(connection: Redis): Queue<EmailJobData> {
  return new Queue<EmailJobData>(EMAIL_QUEUE_NAME, { connection });
}

export async function enqueueEmail(queue: Queue<EmailJobData>, data: EmailJobData): Promise<void> {
  // Idempotency: one logical email (e.g. a specific invite) maps to a deterministic jobId,
  // so re-enqueuing the same logical send is a no-op rather than a duplicate email.
  // BullMQ rejects custom job IDs containing ':' (reserved for its own key
  // namespacing), so use '__' as the separator instead.
  const idempotencyKey = `${data.template}__${data.to}__${data.data.tokenId ?? data.requestId}`;
  await queue.add(data.template, data, { ...DEFAULT_JOB_OPTIONS, jobId: idempotencyKey });
}
