import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadSocialSyncWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import { TokenEncryptionService } from "@yoyo/crypto";
import { AnthropicProvider } from "@yoyo/ai";
import { InstagramMediaReaderProvider } from "@yoyo/integrations";
import { createRedisConnection, SOCIAL_SYNC_QUEUE_NAME, type SocialSyncJobData } from "@yoyo/queue";
import { processSocialSync } from "./process-sync";

const env = loadSocialSyncWorkerEnv();
const logger = createLogger("worker-social-sync");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
const tokenEncryption = new TokenEncryptionService(env.ENCRYPTION_KEY);
const aiProvider = new AnthropicProvider(env.ANTHROPIC_API_KEY);

const instagramMediaReader = new InstagramMediaReaderProvider({
  graphApiVersion: env.META_GRAPH_API_VERSION,
  ...(env.META_GRAPH_BASE_URL ? { graphBaseUrl: env.META_GRAPH_BASE_URL } : {})
});

const worker = new Worker<SocialSyncJobData>(
  SOCIAL_SYNC_QUEUE_NAME,
  async (job: Job<SocialSyncJobData>) => {
    const result = await processSocialSync(
      {
        prisma,
        tokenEncryption,
        mediaReaders: { INSTAGRAM: instagramMediaReader },
        aiProvider,
        aiModel: env.AI_DEFAULT_MODEL
      },
      job.data.socialSyncId
    );
    logger.info({ jobId: job.id, requestId: job.data.requestId, socialSyncId: job.data.socialSyncId, result }, "social sync processed");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 3 }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "social sync failed");
});

logger.info("worker-social-sync started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-social-sync shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
