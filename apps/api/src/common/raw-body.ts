import type { INestApplication } from "@nestjs/common";
import express, { json, urlencoded } from "express";
import type { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

/**
 * Installs Express's body parsers manually (Nest is bootstrapped with
 * bodyParser: false) with a `verify` hook that stashes the raw bytes on the
 * request. Needed because Meta's webhook signature (X-Hub-Signature-256) is an
 * HMAC over the exact request body, not a re-serialization of the parsed JSON.
 */
export function configureRawBodyCapture(app: INestApplication): void {
  const captureRawBody = (req: Request, _res: express.Response, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(json({ verify: captureRawBody }));
  app.use(urlencoded({ extended: true, verify: captureRawBody }));
}
