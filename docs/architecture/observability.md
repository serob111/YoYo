# Observability

## Structured logging

All logs are structured JSON (pino). Every log line emitted within a request or job carries, when available:

`requestId`, `traceId`, `organizationId`, `userId`, `jobId`

(Later phases add `conversationId`, `connectedAccountId`, `provider`, `providerEventId` once those contexts exist.)

`requestId` is generated at the API's entry middleware and threaded through: into the `TenantContext` (see `docs/architecture/tenant-model.md`), into any job enqueued as a result of the request, and into audit log rows written during it — so a single id ties together "what did the user do, what got logged, what got queued, what got audited."

## Never logged

Passwords, password hashes, session ids/tokens, magic-link tokens, and full authorization headers are never written to logs. This is enforced by keeping these values out of the objects passed to the logger in the first place (redaction as a backstop, not the primary control) — pino's redaction paths are configured for known-sensitive field names as defense in depth.

## What Phase 1 actually instruments

- HTTP access logs (method, path, status, duration, the context fields above) for every request.
- `GET /health/live` and `GET /health/ready` (DB + Redis ping).
- Job lifecycle logs for the `email` queue (enqueued, started, completed, failed, retry count).

## What's deferred until there's a workload to observe

Metrics export (OpenTelemetry), error tracking integration, dashboards, and alerting rules are real requirements for production operation, but wiring them against a system with one background job type and no external traffic produces noise, not signal. They're added starting Phase 2 once webhook ingestion, provider calls, and queue depth are real things worth alerting on. The failure-category taxonomy below is established now so later phases plug into it rather than inventing categories ad hoc.

## Failure taxonomy (used from Phase 2 onward, defined now)

| Category | Meaning | Example |
|---|---|---|
| `RETRYABLE` | Transient; safe to retry with backoff | provider 500, network timeout |
| `NON_RETRYABLE` | Retrying won't help; needs a code/data fix or is permanently invalid | malformed media, validation failure |
| `REQUIRES_RECONCILIATION` | Outcome is ambiguous (e.g. timeout after the provider may have already acted); must check actual state before retrying | send timed out after transmission |
| `ACTION_REQUIRED` | Needs a human/business action, not a retry | expired OAuth token, revoked scope |

## Health endpoint semantics

`/health/live`: process is running, nothing more. `/health/ready`: the API can serve requests — checks its own critical dependencies (DB, Redis) only. Once external providers are integrated, their outages affect a per-connection capability/degraded state (surfaced to the org, per `docs/architecture/provider-abstraction.md`), not the application's own readiness — a TikTok outage should never make `/health/ready` fail.
