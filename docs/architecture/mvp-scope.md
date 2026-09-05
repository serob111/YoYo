# MVP / Phase Scope

Mirrors the brief's phased delivery plan. Each phase is its own planning-and-review round; a phase does not start until the previous one's exit criteria are met. This document exists so scope creep within a phase is visible against the original plan.

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Architecture: bounded contexts, ERD, tenant/RBAC/queue/provider design, ADRs, this scope doc | Reviewed and approved (this document set) |
| **1 (this engagement)** | **Foundation**: monorepo, auth, organizations/membership, RBAC, tenant-safe repositories, audit log, health endpoints, CI | **Tenant-isolation test suite passes; signup→org→invite→accept flow works end-to-end** |
| 2 | Instagram messaging: OAuth, webhooks, dedup, contacts/conversations/messages, unified inbox, outbound send, human takeover — no AI | Deterministic messaging reliable under retries/duplicates |
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
