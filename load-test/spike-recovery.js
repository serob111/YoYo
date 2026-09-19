// Baseline inbound-webhook rate, a short high-rate spike, then back to
// baseline - used to measure queue-depth drain time and how long p95 latency
// takes to return to its pre-spike level. Sample with
// scripts/sample-metrics.sh and scripts/queue-stats.js running throughout.
//
// Usage:
//   k6 run -e API_BASE_URL=http://localhost:4000 -e META_APP_SECRET=... \
//     -e BASELINE_RATE=2 -e SPIKE_MULTIPLIER=3 load-test/spike-recovery.js
import http from "k6/http";
import { check } from "k6";
import { buildSignedWebhookRequest } from "./lib/webhook.js";

const API_BASE_URL = __ENV.API_BASE_URL || "http://localhost:4000";
const META_APP_SECRET = __ENV.META_APP_SECRET;
if (!META_APP_SECRET) {
  throw new Error("META_APP_SECRET env var is required (must match the target environment's real value)");
}
const BASELINE_RATE = Number(__ENV.BASELINE_RATE || 2);
const SPIKE_MULTIPLIER = Number(__ENV.SPIKE_MULTIPLIER || 3);
const ORG_COUNT = 10;

export const options = {
  scenarios: {
    spike_recovery: {
      executor: "ramping-arrival-rate",
      startRate: BASELINE_RATE,
      timeUnit: "1s",
      preAllocatedVUs: Math.max(20, BASELINE_RATE * SPIKE_MULTIPLIER * 3),
      maxVUs: Math.max(100, BASELINE_RATE * SPIKE_MULTIPLIER * 6),
      stages: [
        { target: BASELINE_RATE, duration: "1m" }, // baseline warm-up
        { target: BASELINE_RATE * SPIKE_MULTIPLIER, duration: "10s" }, // ramp into the spike
        { target: BASELINE_RATE * SPIKE_MULTIPLIER, duration: "30s" }, // hold the spike
        { target: BASELINE_RATE, duration: "10s" }, // ramp back down
        { target: BASELINE_RATE, duration: "3m" } // observe recovery
      ]
    }
  },
  thresholds: {
    // No hard failure threshold on error rate here deliberately - the spike is
    // expected to stress the system; the report reads recovery behavior off
    // the raw time series, not a pass/fail gate.
  }
};

export default function () {
  const { body, headers } = buildSignedWebhookRequest(META_APP_SECRET, ORG_COUNT, __VU, __ITER);
  const res = http.post(`${API_BASE_URL}/webhooks/instagram`, body, { headers, tags: { name: "inbound_webhook" } });
  check(res, { "webhook accepted": (r) => r.status === 200 });
}
