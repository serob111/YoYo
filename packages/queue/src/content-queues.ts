import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const CONTENT_GENERATION_QUEUE_NAME = "content-generation";
export const PUBLISHING_QUEUE_NAME = "publishing";

export interface GenerateCaptionJobData {
  contentItemId: string;
  instruction?: string;
  requestId: string;
}

export interface EnhanceImageJobData {
  contentItemId: string;
  mediaAssetId: string;
  instruction: string;
  requestId: string;
}

export interface PublishContentJobData {
  contentItemId: string;
  requestId: string;
}

const CONTENT_GENERATION_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

// Publishing needs a much longer backoff ceiling than content generation's -
// a RETRYABLE failure (e.g. Instagram's 24h publishing quota exhausted) may
// legitimately need hours, not seconds, before retrying makes sense.
const PUBLISHING_JOB_OPTIONS: JobsOptions = {
  attempts: 8,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createContentGenerationQueue(connection: Redis): Queue<GenerateCaptionJobData | EnhanceImageJobData> {
  return new Queue<GenerateCaptionJobData | EnhanceImageJobData>(CONTENT_GENERATION_QUEUE_NAME, { connection });
}

export function createPublishingQueue(connection: Redis): Queue<PublishContentJobData> {
  return new Queue<PublishContentJobData>(PUBLISHING_QUEUE_NAME, { connection });
}

// BullMQ rejects custom job IDs containing ':' (reserved for its own key
// namespacing), so '__' is used as the separator, matching automation-queues.ts.
export async function enqueueCaptionGeneration(queue: Queue<GenerateCaptionJobData | EnhanceImageJobData>, data: GenerateCaptionJobData): Promise<void> {
  await queue.add("generate-caption", data, { ...CONTENT_GENERATION_JOB_OPTIONS, jobId: `caption__${data.contentItemId}` });
}

export async function enqueueImageEnhancement(queue: Queue<GenerateCaptionJobData | EnhanceImageJobData>, data: EnhanceImageJobData): Promise<void> {
  await queue.add("enhance-image", data, { ...CONTENT_GENERATION_JOB_OPTIONS, jobId: `enhance__${data.mediaAssetId}` });
}

export async function enqueuePublish(queue: Queue<PublishContentJobData>, data: PublishContentJobData): Promise<void> {
  // Deterministic jobId keyed on contentItemId is the first line of defense
  // for the duplicate-publish-prevention exit criterion - even if the
  // ContentDispatcherService's claim query somehow ran twice for the same
  // row, BullMQ itself would refuse the second enqueue. The atomic
  // APPROVED -> PUBLISHING DB claim in worker-publishing is the second,
  // authoritative line of defense.
  await queue.add("publish", data, { ...PUBLISHING_JOB_OPTIONS, jobId: `publish__${data.contentItemId}` });
}
