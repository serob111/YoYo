import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, type Job } from "bullmq";
import { loadWorkerEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { createRedisConnection, EMAIL_QUEUE_NAME, type EmailJobData } from "@yoyo/queue";
import { ConsoleEmailProvider } from "./email-provider";
import { renderEmail } from "./templates";

const env = loadWorkerEnv();
const logger = createLogger("worker-email");
const emailProvider = new ConsoleEmailProvider();

const worker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { subject, text } = renderEmail(job.data, env.WEB_APP_URL);
    await emailProvider.send({ to: job.data.to, from: env.EMAIL_FROM_ADDRESS, subject, text });
    logger.info({ jobId: job.id, requestId: job.data.requestId, template: job.data.template }, "email sent");
  },
  {
    connection: createRedisConnection(env.REDIS_URL),
    // Deliberately small and explicit rather than left at a library default —
    // see docs/architecture/queue-topology.md's backpressure conventions.
    concurrency: 5
  }
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error.message, attempts: job?.attemptsMade }, "email job failed");
});

logger.info("worker-email started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "worker-email shutting down");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
