import "reflect-metadata";
import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly
// and won't have a .env file, so a missing file here is not an error.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { loadApiEnv } from "@yoyo/config";
import { createLogger } from "@yoyo/logger";
import { AppModule } from "./app.module";
import { configureRawBodyCapture } from "./common/raw-body";

async function bootstrap() {
  const env = loadApiEnv();
  const logger = createLogger("api");

  // bodyParser: false so we can install json()/urlencoded() ourselves with a
  // `verify` hook that stashes the raw bytes - required to check Meta's
  // webhook HMAC signature, which is computed over the exact bytes sent.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  // Behind any reverse proxy (staging/production PaaS), req.ip otherwise
  // resolves to the proxy's own address for every request, silently breaking
  // the per-client auth rate limiter and audit-log IP - trusting the first
  // hop is correct as long as the platform's edge is the only thing in front
  // of this process (true for a single-proxy PaaS deploy).
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  configureRawBodyCapture(app);
  app.use(cookieParser());
  // A JSON API has no business being indexed regardless of environment.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  app.enableCors({ origin: env.WEB_APP_URL, credentials: true });
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  logger.info({ port: env.PORT }, "API listening");
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start API", error);
  process.exit(1);
});
