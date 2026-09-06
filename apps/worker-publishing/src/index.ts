import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadPublishingWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { TokenEncryptionService } from "@yoyo/crypto";
import { StorageClient } from "@yoyo/storage";
import { PUBLISHING_QUEUE_NAME, createRedisConnection, type PublishContentJobData } from "@yoyo/queue";
import { publishContentItem } from "./publish-content";
import { createPublishingProvider } from "./provider-factory";

const env = loadPublishingWorkerEnv();
const logger = createLogger("worker-publishing");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const tokenEncryption = new TokenEncryptionService(env.ENCRYPTION_KEY);
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

const worker = new Worker<PublishContentJobData>(
  PUBLISHING_QUEUE_NAME,
  async (job: Job<PublishContentJobData>) => {
    if (!storage) throw new Error("Object storage is not configured (S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)");
    const result = await publishContentItem(
      prisma,
      storage,
      tokenEncryption,
      (provider) => createPublishingProvider(provider, { metaGraphApiVersion: env.META_GRAPH_API_VERSION, metaGraphBaseUrl: env.META_GRAPH_BASE_URL, tiktokApiBaseUrl: env.TIKTOK_API_BASE_URL }),
      job.data.contentItemId
    );
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "content item publish processed");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 3 }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "content publish failed");
});

logger.info("worker-publishing started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-publishing shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
