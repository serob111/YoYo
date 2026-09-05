import IORedis, { type Redis } from "ioredis";

let sharedConnection: Redis | undefined;

export function createRedisConnection(redisUrl: string): Redis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
}

// BullMQ requires one dedicated connection per Queue/Worker instance in strict mode,
// but a single shared ioredis connection is fine for simple producer usage (enqueueing).
export function getSharedRedisConnection(redisUrl: string): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection(redisUrl);
  }
  return sharedConnection;
}
