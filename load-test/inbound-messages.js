// Drives inbound Instagram webhook traffic at a constant rate, exactly
// matching the real payload shape (packages/integrations/src/instagram/webhook-payload.ts)
// and HMAC signature (webhook-signature.guard.ts) so requests take the real
// verify -> validate -> persist -> dedupe -> enqueue path, landing on one of
// the 10 ConnectedAccounts created by seed-load-test.ts.
//
// Usage:
//   k6 run -e API_BASE_URL=http://localhost:4000 -e META_APP_SECRET=... -e RATE=5 \
//     load-test/inbound-messages.js
import http from "k6/http";
import { check } from "k6";
import { buildSignedWebhookRequest } from "./lib/webhook.js";

const API_BASE_URL = __ENV.API_BASE_URL || "http://localhost:4000";
const META_APP_SECRET = __ENV.META_APP_SECRET;
if (!META_APP_SECRET) {
  throw new Error("META_APP_SECRET env var is required (must match the target environment's real value)");
}
const RATE = Number(__ENV.RATE || 1);
const DURATION = __ENV.DURATION || "3m";
const ORG_COUNT = 10;

export const options = {
  scenarios: {
    inbound_messages: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: Math.max(10, RATE * 2),
      maxVUs: Math.max(50, RATE * 5)
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"]
  }
};

export default function () {
  const { body, headers } = buildSignedWebhookRequest(META_APP_SECRET, ORG_COUNT, __VU, __ITER);
  const res = http.post(`${API_BASE_URL}/webhooks/instagram`, body, { headers, tags: { name: "inbound_webhook" } });
  check(res, { "webhook accepted": (r) => r.status === 200 });
}
