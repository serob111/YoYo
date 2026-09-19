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
  // Distinct per (event, lead) pair when one outbox event can match multiple
  // leads (e.g. a LISTING_MATCHED property.activated event matching several
  // contacts' BuyerPreferences) - defaults to outboxEventId when omitted,
  // which is already unique enough for the single-lead-per-event triggers.
  triggerEventId?: string;
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
  // Idempotent by construction: jobId = the causing OutboxEvent's id + the
  // lead it's for. Including leadId matters because one outbox event (e.g. a
  // LISTING_MATCHED property activation) can fan out to several leads - each
  // needs its own job, not a single job that collides on retry/redispatch.
  await queue.add("process", data, { ...DEFAULT_JOB_OPTIONS, jobId: `automation-trigger__${data.outboxEventId}__${data.leadId}` });
}

export async function enqueueFollowUp(queue: Queue<FollowUpJobData>, data: FollowUpJobData): Promise<void> {
  await queue.add("execute", data, { ...DEFAULT_JOB_OPTIONS, jobId: `follow-up__${data.followUpId}` });
}
