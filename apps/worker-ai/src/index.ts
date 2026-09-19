import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadAiWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { AnthropicProvider, VoyageEmbeddingProvider, FakeLatencyAIProvider, FakeLatencyEmbeddingProvider } from "@yoyo/ai";
import {
  AI_RESPONSES_QUEUE_NAME,
  KNOWLEDGE_EMBEDDINGS_QUEUE_NAME,
  createRedisConnection,
  type AiResponseJobData,
  type KnowledgeEmbeddingJobData
} from "@yoyo/queue";
import { generateAiReply } from "./generate-reply";
import { generateEmbedding } from "./generate-embedding";

const env = loadAiWorkerEnv();
const logger = createLogger("worker-ai");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
// AI_FAKE_LATENCY_MS is load-testing-only (see packages/config's doc comment)
// - unset in every real deployment, so this branch never affects production.
const aiProvider = env.AI_FAKE_LATENCY_MS ? new FakeLatencyAIProvider(env.AI_FAKE_LATENCY_MS) : new AnthropicProvider(env.ANTHROPIC_API_KEY);
const embeddingProvider = env.AI_FAKE_LATENCY_MS
  ? new FakeLatencyEmbeddingProvider(env.AI_FAKE_LATENCY_MS)
  : new VoyageEmbeddingProvider(env.VOYAGE_API_KEY, env.AI_EMBEDDING_MODEL);
if (env.AI_FAKE_LATENCY_MS) {
  logger.info({ delayMs: env.AI_FAKE_LATENCY_MS }, "worker-ai using fake-latency providers (load-test mode, no real LLM calls)");
}

const aiResponsesWorker = new Worker<AiResponseJobData>(
  AI_RESPONSES_QUEUE_NAME,
  async (job: Job<AiResponseJobData>) => {
    const result = await generateAiReply(prisma, aiProvider, embeddingProvider, env.AI_DEFAULT_MODEL, job.data.triggerMessageId);
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "ai reply generated");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 5 }
);

const knowledgeEmbeddingsWorker = new Worker<KnowledgeEmbeddingJobData>(
  KNOWLEDGE_EMBEDDINGS_QUEUE_NAME,
  async (job: Job<KnowledgeEmbeddingJobData>) => {
    const result = await generateEmbedding(prisma, embeddingProvider, job.data.knowledgeChunkId);
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "knowledge chunk embedding generated");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 5 }
);

aiResponsesWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "ai reply generation failed");
});
knowledgeEmbeddingsWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "knowledge chunk embedding failed");
});

logger.info("worker-ai started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-ai shutting down");
  await Promise.all([aiResponsesWorker.close(), knowledgeEmbeddingsWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
