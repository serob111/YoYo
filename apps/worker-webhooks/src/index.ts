import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadWebhooksWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { createRedisConnection, WEBHOOK_EVENTS_QUEUE_NAME, type WebhookEventJobData } from "@yoyo/queue";
import { normalizeWebhookEvent } from "./normalize";

const env = loadWebhooksWorkerEnv();
const logger = createLogger("worker-webhooks");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });

const worker = new Worker<WebhookEventJobData>(
  WEBHOOK_EVENTS_QUEUE_NAME,
  async (job: Job<WebhookEventJobData>) => {
    const result = await normalizeWebhookEvent(prisma, job.data.providerWebhookEventId);
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "webhook event normalized");
  },
  {
    connection: createRedisConnection(env.REDIS_URL),
    concurrency: 10
  }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "webhook normalization failed");
});

logger.info("worker-webhooks started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-webhooks shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
