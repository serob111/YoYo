import { createEmailQueue, createRedisConnection, type EmailJobData } from "@yoyo/queue";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";

let queue: Queue<EmailJobData> | undefined;
let connection: Redis | undefined;

function getQueue(): Queue<EmailJobData> {
  if (!queue) {
    connection = createRedisConnection(process.env.REDIS_URL!);
    queue = createEmailQueue(connection);
  }
  return queue;
}

/**
 * No email worker runs during integration tests, so enqueued jobs sit in Redis.
 * This reads the token directly out of the queued job payload to drive
 * magic-link/invite/reset flows end-to-end without a live email pipeline.
 */
export async function findLastEmailToken(to: string, template: EmailJobData["template"]): Promise<string> {
  const q = getQueue();
  const jobs = await q.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
  const match = jobs
    .filter((job) => job.data.to === to && job.data.template === template)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
  if (!match) {
    throw new Error(`No queued ${template} email found for ${to}`);
  }
  return match.data.data.tokenId!;
}

export async function closeEmailQueueInspector(): Promise<void> {
  // BullMQ does not close a connection it was not given ownership of, so the
  // underlying ioredis connection must be quit separately or the process (and
  // Jest) hangs on an open handle after the test run finishes.
  await queue?.close();
  await connection?.quit();
  queue = undefined;
  connection = undefined;
}
