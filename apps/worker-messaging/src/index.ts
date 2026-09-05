import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadMessagingWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { TokenEncryptionService } from "@yoyo/crypto";
import { InstagramMessagingProvider } from "@yoyo/integrations";
import { createRedisConnection, OUTBOUND_MESSAGES_QUEUE_NAME, type OutboundMessageJobData } from "@yoyo/queue";
import { sendPendingMessage } from "./send";

const env = loadMessagingWorkerEnv();
const logger = createLogger("worker-messaging");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const tokenEncryption = new TokenEncryptionService(env.ENCRYPTION_KEY);
const messagingProvider = new InstagramMessagingProvider({
  graphApiVersion: env.META_GRAPH_API_VERSION,
  ...(env.META_GRAPH_BASE_URL ? { graphBaseUrl: env.META_GRAPH_BASE_URL } : {})
});

const worker = new Worker<OutboundMessageJobData>(
  OUTBOUND_MESSAGES_QUEUE_NAME,
  async (job: Job<OutboundMessageJobData>) => {
    const result = await sendPendingMessage(prisma, tokenEncryption, messagingProvider, job.data.messageId);
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "outbound message processed");
  },
  {
    connection: createRedisConnection(env.REDIS_URL),
    // Deliberately small: sends are rate-limited by the provider and by the
    // 24-hour messaging window rules, not by our own throughput needs yet.
    concurrency: 5
  }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "outbound message send failed");
});

logger.info("worker-messaging started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-messaging shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
