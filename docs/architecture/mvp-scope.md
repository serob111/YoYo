# MVP / Phase Scope

Mirrors the brief's phased delivery plan. Each phase is its own planning-and-review round; a phase does not start until the previous one's exit criteria are met. This document exists so scope creep within a phase is visible against the original plan.

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Architecture: bounded contexts, ERD, tenant/RBAC/queue/provider design, ADRs, this scope doc | Reviewed and approved (this document set) |
| **1 (done)** | **Foundation**: monorepo, auth, organizations/membership, RBAC, tenant-safe repositories, audit log, health endpoints, CI | **Tenant-isolation test suite passes; signup→org→invite→accept flow works end-to-end** ✅ |
| **2 (this engagement, done)** | **Instagram messaging**: OAuth (Instagram Business Login), webhook ingestion + dedup, transactional outbox, contacts/conversations/messages, unified inbox backend, outbound send, conversation assignment ("human takeover" = claiming a conversation; no AI to take over *from* yet — see ADR note below) | **Deterministic messaging reliable under retries/duplicates** ✅ — proven by: same webhook delivered 5x → one Message; concurrent normalization/send → no duplicates; tenant isolation extended to all new resources; real Graph API profile-fetch smoke test; full send pipeline proven against a local HTTP stub |
| 3 | AI sales: business profile, products/services, knowledge base + pgvector RAG, AI provider abstraction, structured output, tools, usage tracking, cost controls | AI responses are schema-validated, tenant-scoped retrieval proven, cost limits enforced |
| 4 | CRM: contacts, leads, pipelines, stages, activities, tasks, tags, assignments; AI tools wired to CRM | AI actions mutate CRM only through controlled tools |
| 5 | Follow-ups & automations: durable follow-up scheduler, event-driven automation engine, cancellation, business-hours/timezone logic | No infinite loops/duplicate actions under the concurrency test matrix |
| 6 | Content & publishing: generation pipeline, approval workflow, scheduling, Instagram/TikTok publishing, media pipeline | Duplicate-publish prevention proven; auto-publish is opt-in and audited |
| 7 | Billing: Stripe, entitlements, usage accounting | Entitlement checks centralized; Stripe webhooks idempotent |
| 8+ | WhatsApp messaging, analytics aggregation, realtime (WebSocket/SSE), admin panel, hardening (circuit breaking, load testing, backups/DR drills, abuse protection) | Per-feature, defined when reached |

## What "done" means for Phase 1 specifically

1. `docker compose up`, migrate, and boot both apps locally without manual fixups.
2. A user can sign up, create an organization, invite a second user, have them accept, and see them in the members list with an assigned role.
3. Removing/demoting members and role-gated actions are enforced through `PermissionsService`, not ad hoc role checks.
4. Every mutating action in Identity & Access writes an audit log row.
5. `/health/live` and `/health/ready` behave correctly (ready fails if DB/Redis is down, live doesn't).
6. The tenant-isolation test suite passes for every Phase 1 endpoint.
7. CI runs lint/typecheck/unit/integration/build on every push and fails the build on any red step.

## What "done" means for Phase 2 specifically

1. Real Instagram Graph API adapter (`packages/integrations`) implementing OAuth (Business Login), profile fetch, capability resolution, webhook signature verification/payload normalization, and message sending — built against Meta's current official docs, verified with a live test account's profile-fetch call.
2. Webhook ingestion is idempotent: the same delivery replayed any number of times produces exactly one `Message`, proven under both sequential retries and concurrent normalization calls.
3. The transactional outbox (ADR-0004) is implemented: webhook ingestion and outbound message creation both write an outbox row in the same transaction as the business row; a poll-based dispatcher in `apps/api` dispatches it to BullMQ using `FOR UPDATE SKIP LOCKED`, proven safe under two concurrent dispatcher instances.
4. Outbound sends go through the real provider adapter with failure-category-aware handling (RETRYABLE / NON_RETRYABLE / ACTION_REQUIRED / REQUIRES_RECONCILIATION per `docs/architecture/observability.md`) — proven against a scripted mock provider for every category, and against a local HTTP stub for the real request/response mechanics end-to-end.
5. Tenant isolation extended and re-proven for connected accounts, conversations, and messages.
6. No live Meta app, no live webhook delivery, no realtime push — explicitly deferred per the approved Phase 2 plan; the whole pipeline is proven via mocked-HTTP-boundary tests plus one live read-only Graph API call.
