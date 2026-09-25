import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const SOCIAL_SYNC_QUEUE_NAME = "social-sync";

export interface SocialSyncJobData {
  socialSyncId: string;
  connectedAccountId: string;
  requestId: string;
}

const SOCIAL_SYNC_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createSocialSyncQueue(connection: Redis): Queue<SocialSyncJobData> {
  return new Queue<SocialSyncJobData>(SOCIAL_SYNC_QUEUE_NAME, { connection });
}

// One SocialSync row = one job - a new "Scan Instagram" click always creates
// a new SocialSync row (and therefore a new deterministic jobId), which is
// the correct behavior (a real new sync attempt). This jobId only protects
// against the same outbox row being dispatched twice.
export async function enqueueSocialSync(queue: Queue<SocialSyncJobData>, data: SocialSyncJobData): Promise<void> {
  await queue.add("sync", data, { ...SOCIAL_SYNC_JOB_OPTIONS, jobId: `social-sync__${data.socialSyncId}` });
}
