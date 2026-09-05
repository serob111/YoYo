# Queue Topology

## Why BullMQ + Redis now, not Kafka

Phase 1's async workload is one email queue. Even the full target workload (webhooks, messaging, AI, publishing, automations) is job-shaped — "do this discrete unit of work, retry with backoff on failure, dead-letter after N attempts" — not a log-streaming/event-sourcing workload. BullMQ on Redis (already required for caching/rate-limiting/sessions-adjacent needs) covers this without operating a second distributed system. Kafka becomes worth its operational cost only if a measured requirement shows up (e.g. needing multiple independent consumer groups replaying the same event stream) — see `docs/adr/0003-bullmq-for-queues.md`.

## Phase 1 queues (implemented)

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `email` | API (`NotificationsModule`) | `worker-email` | Send magic-link, invite, and password-reset emails via `EmailProvider` |

## Target queue map (later phases, not implemented yet)

| Queue | Consumer worker | Introduced in |
|---|---|---|
| `webhook-events` | `worker-webhooks` | Phase 2 |
| `inbound-messages` | `worker-messaging` | Phase 2 |
| `outbound-messages` | `worker-messaging` | Phase 2 |
| `ai` | `worker-ai` | Phase 3 |
| `knowledge-ingestion` | `worker-ai` | Phase 3 |
| `follow-ups` | `worker-automations` | Phase 5 |
| `automations` | `worker-automations` | Phase 5 |
| `publishing` | `worker-publishing` | Phase 6 |
| `media` | `worker-media` | Phase 6 |
| `analytics` | `worker-automations` (or dedicated later if volume justifies) | Phase 6+ |
| `billing` | shared with API-triggered reconciliation jobs | Phase 7 |
| `notifications` | may fold into `email` worker or split when channels beyond email exist | Phase 7+ |

Each consumer worker is its own deployable process/container so it scales independently (per `docs/architecture/deployment-topology.md`).

## Job conventions (apply from Phase 1 onward)

- **Deterministic job name** per job type.
- **Idempotency key** where the job could be enqueued more than once for the same logical unit of work (e.g. `email:invite:{organizationMemberId}`) — the worker checks/records completion keyed on this before doing the side-effecting work, so a duplicate enqueue is a no-op rather than a duplicate email.
- **Retry/backoff**: exponential backoff, capped attempts; different failure categories get different handling per `docs/architecture/observability.md`'s failure taxonomy (`RETRYABLE`, `NON_RETRYABLE`, `REQUIRES_RECONCILIATION`, `ACTION_REQUIRED`) — e.g. an invalid recipient address is `NON_RETRYABLE` and shouldn't burn retry attempts.
- **Dead-letter behavior**: failed-beyond-retries jobs stay inspectable (BullMQ's failed set) rather than being dropped; a future admin-panel phase adds tooling to inspect/retry them, but even in Phase 1 nothing silently disappears.
- **Correlation ID**: every job payload carries the `requestId` that created it, so a job's logs can be traced back to the HTTP request that enqueued it.

## Backpressure

Worker concurrency is configured per worker type (env-configurable), not unbounded. Even in Phase 1 this is set explicitly for `worker-email` rather than left at a library default, establishing the pattern before higher-volume queues (AI, publishing) exist.
