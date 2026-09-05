import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const AUTOMATIONS_QUEUE_NAME = "automations";
export const FOLLOW_UPS_QUEUE_NAME = "follow-ups";

export interface AutomationTriggerJobData {
  outboxEventId: string;
  eventType: string;
  organizationId: string;
  leadId: string;
  payload: Record<string, unknown>;
  requestId: string;
}

export interface FollowUpJobData {
  followUpId: string;
  requestId: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 3_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createAutomationsQueue(connection: Redis): Queue<AutomationTriggerJobData> {
  return new Queue<AutomationTriggerJobData>(AUTOMATIONS_QUEUE_NAME, { connection });
}

export function createFollowUpsQueue(connection: Redis): Queue<FollowUpJobData> {
  return new Queue<FollowUpJobData>(FOLLOW_UPS_QUEUE_NAME, { connection });
}

// BullMQ rejects custom job IDs containing ':' (reserved for its own key
// namespacing), so use '__' as the separator instead.
export async function enqueueAutomationTrigger(queue: Queue<AutomationTriggerJobData>, data: AutomationTriggerJobData): Promise<void> {
  // Idempotent by construction: jobId = the causing OutboxEvent's own id.
  await queue.add("process", data, { ...DEFAULT_JOB_OPTIONS, jobId: `automation-trigger__${data.outboxEventId}` });
}

export async function enqueueFollowUp(queue: Queue<FollowUpJobData>, data: FollowUpJobData): Promise<void> {
  await queue.add("execute", data, { ...DEFAULT_JOB_OPTIONS, jobId: `follow-up__${data.followUpId}` });
}
