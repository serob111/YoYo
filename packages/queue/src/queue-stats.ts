// Load-testing observability only - not imported by any app. Prints queue
// depth (BullMQ's own job counts) plus wait/processing time sampled from the
// most recently completed jobs, for every queue relevant to the inbound
// webhook -> AI reply -> outbound send pipeline. Run repeatedly during a k6
// run (e.g. every 5-10s) to build a queue-depth-over-time picture.
//
// Usage: REDIS_URL=redis://localhost:6379 node dist/queue-stats.js
import { createRedisConnection } from "./connection";
import { WEBHOOK_EVENTS_QUEUE_NAME, OUTBOUND_MESSAGES_QUEUE_NAME } from "./messaging-queues";
import { AI_RESPONSES_QUEUE_NAME } from "./ai-queues";
import { Queue } from "bullmq";

const QUEUE_NAMES = [WEBHOOK_EVENTS_QUEUE_NAME, OUTBOUND_MESSAGES_QUEUE_NAME, AI_RESPONSES_QUEUE_NAME];
const RECENT_COMPLETED_SAMPLE_SIZE = 20;

interface QueueSnapshot {
  queue: string;
  counts: { waiting: number; active: number; delayed: number; failed: number; completed: number };
  recentCompletedSample: number;
  avgWaitMs: number | null;
  avgProcessingMs: number | null;
}

async function snapshotQueue(redisUrl: string, queueName: string): Promise<QueueSnapshot> {
  const queue = new Queue(queueName, { connection: createRedisConnection(redisUrl) });
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    const recentCompleted = await queue.getJobs(["completed"], 0, RECENT_COMPLETED_SAMPLE_SIZE - 1, false);

    const waitSamples = recentCompleted
      .filter((job) => job.processedOn != null && job.timestamp != null)
      .map((job) => job.processedOn! - job.timestamp!);
    const processingSamples = recentCompleted
      .filter((job) => job.finishedOn != null && job.processedOn != null)
      .map((job) => job.finishedOn! - job.processedOn!);

    return {
      queue: queueName,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0
      },
      recentCompletedSample: recentCompleted.length,
      avgWaitMs: average(waitSamples),
      avgProcessingMs: average(processingSamples)
    };
  } finally {
    await queue.close();
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required");

  const snapshots = await Promise.all(QUEUE_NAMES.map((name) => snapshotQueue(redisUrl, name)));
  console.log(JSON.stringify({ sampledAt: new Date().toISOString(), queues: snapshots }));
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
