import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";

export const AI_RESPONSES_QUEUE_NAME = "ai-responses";
export const KNOWLEDGE_EMBEDDINGS_QUEUE_NAME = "knowledge-embeddings";

export interface AiResponseJobData {
  triggerMessageId: string;
  requestId: string;
}

export interface KnowledgeEmbeddingJobData {
  knowledgeChunkId: string;
  requestId: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 3_000 },
  removeOnComplete: { age: 60 * 60 * 24 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

export function createAiResponsesQueue(connection: Redis): Queue<AiResponseJobData> {
  return new Queue<AiResponseJobData>(AI_RESPONSES_QUEUE_NAME, { connection });
}

export function createKnowledgeEmbeddingsQueue(connection: Redis): Queue<KnowledgeEmbeddingJobData> {
  return new Queue<KnowledgeEmbeddingJobData>(KNOWLEDGE_EMBEDDINGS_QUEUE_NAME, { connection });
}

// BullMQ rejects custom job IDs containing ':' (reserved for its own key
// namespacing), so use '__' as the separator instead.
export async function enqueueAiResponse(queue: Queue<AiResponseJobData>, data: AiResponseJobData): Promise<void> {
  // Idempotent by construction: jobId = the trigger message's own id. The
  // AiResponse.triggerMessageId unique constraint is the second, DB-level line
  // of defense if a job is somehow enqueued twice anyway.
  await queue.add("generate", data, { ...DEFAULT_JOB_OPTIONS, jobId: `ai-response__${data.triggerMessageId}` });
}

export async function enqueueKnowledgeEmbedding(queue: Queue<KnowledgeEmbeddingJobData>, data: KnowledgeEmbeddingJobData): Promise<void> {
  await queue.add("embed", data, { ...DEFAULT_JOB_OPTIONS, jobId: `knowledge-embedding__${data.knowledgeChunkId}` });
}
