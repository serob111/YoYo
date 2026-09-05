import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadAutomationsWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createPrismaClient } from "@yoyo/database";
import {
  AUTOMATIONS_QUEUE_NAME,
  FOLLOW_UPS_QUEUE_NAME,
  createRedisConnection,
  type AutomationTriggerJobData,
  type FollowUpJobData
} from "@yoyo/queue";
import { executeFollowUp } from "./execute-follow-up";
import { processAutomationTrigger } from "./process-automation-trigger";

const env = loadAutomationsWorkerEnv();
const logger = createLogger("worker-automations");
const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });

const followUpsWorker = new Worker<FollowUpJobData>(
  FOLLOW_UPS_QUEUE_NAME,
  async (job: Job<FollowUpJobData>) => {
    const result = await executeFollowUp(prisma, job.data.followUpId);
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "follow-up executed");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 5 }
);

const automationsWorker = new Worker<AutomationTriggerJobData>(
  AUTOMATIONS_QUEUE_NAME,
  async (job: Job<AutomationTriggerJobData>) => {
    const result = await processAutomationTrigger(prisma, {
      outboxEventId: job.data.outboxEventId,
      eventType: job.data.eventType as "lead.created" | "lead.stage_changed",
      organizationId: job.data.organizationId,
      leadId: job.data.leadId,
      payload: job.data.payload
    });
    logger.info({ jobId: job.id, requestId: job.data.requestId, result }, "automation trigger processed");
  },
  { connection: createRedisConnection(env.REDIS_URL), concurrency: 5 }
);

followUpsWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "follow-up execution failed");
});
automationsWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "automation trigger processing failed");
});

logger.info("worker-automations started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-automations shutting down");
  await Promise.all([followUpsWorker.close(), automationsWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
