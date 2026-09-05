import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@yoyo/database";
import type { ApiEnv } from "@yoyo/config";
import { API_ENV } from "./env.tokens";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({
      databaseUrl: env.DATABASE_URL,
      logQueries: env.NODE_ENV === "development"
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
