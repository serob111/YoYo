import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./crm-helpers";
export * from "./scheduling-helpers";

let prisma: PrismaClient | undefined;

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  logQueries?: boolean;
}

export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: options.databaseUrl } },
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"]
  });
}

// Convenience singleton for scripts/workers that don't run inside Nest's DI container.
export function getPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient(options);
  }
  return prisma;
}
