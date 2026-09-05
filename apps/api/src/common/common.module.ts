import { Global, Module } from "@nestjs/common";
import { loadApiEnv, type ApiEnv } from "@yoyo/config";
import { createRedisConnection } from "@yoyo/queue";
import { API_ENV, REDIS_CONNECTION } from "./env.tokens";
import { PrismaService } from "./prisma.service";
import { RedisLifecycleService } from "./redis-lifecycle.service";

const envProvider = {
  provide: API_ENV,
  useFactory: () => loadApiEnv()
};

const redisProvider = {
  provide: REDIS_CONNECTION,
  useFactory: (env: ApiEnv) => createRedisConnection(env.REDIS_URL),
  inject: [API_ENV]
};

@Global()
@Module({
  providers: [envProvider, redisProvider, PrismaService, RedisLifecycleService],
  exports: [envProvider, redisProvider, PrismaService]
})
export class CommonModule {}
