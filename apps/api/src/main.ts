import "reflect-metadata";
import path from "node:path";
import dotenv from "dotenv";

// Local/dev convenience: load the monorepo-root .env before anything reads
// process.env. Staging/production inject real environment variables directly
// and won't have a .env file, so a missing file here is not an error.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
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
  configureRawBodyCapture(app);
  app.use(cookieParser());
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
