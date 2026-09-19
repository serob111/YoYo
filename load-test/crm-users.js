// Simulates concurrent CRM users browsing the dashboard: log in once, then
// repeatedly poll conversations/leads roughly like the real web app does.
//
// Usage:
//   k6 run --vus 20 --duration 5m -e API_BASE_URL=http://localhost:4000 load-test/crm-users.js
//
// VUs map 1:1 onto the 50 seeded users from packages/database's
// seed-load-test.ts (org{0-9}-user{0-4}@loadtest.yoyo.internal) - use up to
// 50 VUs; beyond that, VUs wrap around and share an account (fine for load
// purposes, just means fewer distinct sessions than VUs).
import http from "k6/http";
import { check, sleep, group } from "k6";

const API_BASE_URL = __ENV.API_BASE_URL || "http://localhost:4000";
const PASSWORD = "load-test-p@ssw0rd-2026";
const USERS_PER_ORG = 5;
const ORG_COUNT = 10;

export const options = {
  // k6 clears each VU's cookie jar between iterations by default - without
  // this, the session cookie from login() would be dropped after the first
  // iteration and every subsequent request would 401, even though ensureLoggedIn()
  // correctly caches organizationId and skips re-login.
  noCookiesReset: true,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"]
  }
};

// Module-level state is per-VU in k6 (each VU runs an isolated JS VM), so this
// survives across iterations of the same VU without needing setup()/teardown().
let organizationId = null;

function credentialsForVu() {
  const userIndex = (__VU - 1) % (ORG_COUNT * USERS_PER_ORG);
  const orgIndex = Math.floor(userIndex / USERS_PER_ORG);
  const userInOrg = userIndex % USERS_PER_ORG;
  return { email: `org${orgIndex}-user${userInOrg}@loadtest.yoyo.internal`, password: PASSWORD };
}

let hasStaggeredStart = false;

function ensureLoggedIn() {
  if (organizationId) return;

  // Real users don't all open the dashboard in the same millisecond - and
  // AuthRateLimitGuard is keyed by IP, so every k6 VU (all sharing this one
  // machine's IP) logging in at t=0 looks identical to a brute-force burst
  // from a single attacker and gets 429'd past RATE_LIMIT_AUTH_MAX_ATTEMPTS.
  // Spreading logins over ~20s avoids that test artifact without touching
  // the rate limiter itself.
  if (!hasStaggeredStart) {
    hasStaggeredStart = true;
    sleep(Math.random() * 20);
  }

  const { email, password } = credentialsForVu();
  const loginRes = http.post(`${API_BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: { "Content-Type": "application/json" },
    tags: { name: "login" }
  });
  check(loginRes, { "login succeeded": (r) => r.status === 200 });

  const orgsRes = http.get(`${API_BASE_URL}/organizations`, { tags: { name: "list_organizations" } });
  check(orgsRes, { "list organizations succeeded": (r) => r.status === 200 });
  const orgs = orgsRes.json();
  organizationId = orgs && orgs[0] ? orgs[0].id : null;
}

export default function () {
  ensureLoggedIn();
  if (!organizationId) {
    // Don't retry-storm on a failed login (e.g. a transient 429) - that would
    // just generate more login attempts from this same shared test IP and
    // keep tripping the per-IP rate limiter for every other VU too. Back off
    // for a normal poll interval and try again next iteration.
    sleep(8 + Math.random() * 2);
    return;
  }

  group("poll conversations", () => {
    const res = http.get(`${API_BASE_URL}/organizations/${organizationId}/conversations`, { tags: { name: "list_conversations" } });
    check(res, { "list conversations succeeded": (r) => r.status === 200 });
  });

  // Roughly matches the real dashboard's polling cadence: conversations every
  // ~8s, leads every ~15s (so leads are fetched on ~every-other iteration).
  if (Math.random() < 0.5) {
    group("poll leads", () => {
      const res = http.get(`${API_BASE_URL}/organizations/${organizationId}/leads`, { tags: { name: "list_leads" } });
      check(res, { "list leads succeeded": (r) => r.status === 200 });
      const body = res.json();
      const leads = body && body.items ? body.items : [];
      if (leads.length > 0 && Math.random() < 0.3) {
        const lead = leads[Math.floor(Math.random() * leads.length)];
        const detailRes = http.get(`${API_BASE_URL}/organizations/${organizationId}/leads/${lead.id}`, { tags: { name: "get_lead" } });
        check(detailRes, { "get lead succeeded": (r) => r.status === 200 });
      }
    });
  }

  sleep(8 + Math.random() * 2);
}
