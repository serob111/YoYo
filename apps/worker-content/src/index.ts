import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadContentWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { AnthropicProvider, GeminiImageProvider } from "@yoyo/ai";
import { StorageClient } from "@yoyo/storage";
import { CONTENT_GENERATION_QUEUE_NAME, createRedisConnection, type EnhanceImageJobData, type GenerateCaptionJobData } from "@yoyo/queue";
import { generateCaption } from "./generate-caption";
import { enhanceImage } from "./enhance-image";

const env = loadContentWorkerEnv();
const logger = createLogger("worker-content");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const aiProvider = new AnthropicProvider(env.ANTHROPIC_API_KEY);
const imageEditProvider = new GeminiImageProvider(env.GEMINI_API_KEY, env.GEMINI_IMAGE_MODEL);
const storage =
  env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? new StorageClient({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE
      })
    : undefined;

const worker = new Worker<GenerateCaptionJobData | EnhanceImageJobData>(
  CONTENT_GENERATION_QUEUE_NAME,
  async (job: Job<GenerateCaptionJobData | EnhanceImageJobData>) => {
    if (job.name === "generate-caption") {
      const data = job.data as GenerateCaptionJobData;
      const result = await generateCaption(prisma, aiProvider, env.AI_DEFAULT_MODEL, data.contentItemId, data.instruction);
      logger.info({ jobId: job.id, requestId: data.requestId, result }, "caption generation processed");
      return;
    }

    if (!storage) throw new Error("Object storage is not configured (S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)");
    const data = job.data as EnhanceImageJobData;
    const result = await enhanceImage(prisma, storage, imageEditProvider, data.mediaAssetId, data.instruction);
    logger.info({ jobId: job.id, requestId: data.requestId, result }, "image enhancement processed");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 5 }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, err: error.message, attempts: job?.attemptsMade }, "content-generation job failed");
});

logger.info("worker-content started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-content shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
