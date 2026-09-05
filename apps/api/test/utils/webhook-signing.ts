import { createHmac } from "node:crypto";

export function signWebhookBody(body: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}
