# MVP / Phase Scope

Mirrors the brief's phased delivery plan. Each phase is its own planning-and-review round; a phase does not start until the previous one's exit criteria are met. This document exists so scope creep within a phase is visible against the original plan.

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Architecture: bounded contexts, ERD, tenant/RBAC/queue/provider design, ADRs, this scope doc | Reviewed and approved (this document set) |
| **1 (done)** | **Foundation**: monorepo, auth, organizations/membership, RBAC, tenant-safe repositories, audit log, health endpoints, CI | **Tenant-isolation test suite passes; signup→org→invite→accept flow works end-to-end** ✅ |
| **2 (this engagement, done)** | **Instagram messaging**: OAuth (Instagram Business Login), webhook ingestion + dedup, transactional outbox, contacts/conversations/messages, unified inbox backend, outbound send, conversation assignment ("human takeover" = claiming a conversation; no AI to take over *from* yet — see ADR note below) | **Deterministic messaging reliable under retries/duplicates** ✅ — proven by: same webhook delivered 5x → one Message; concurrent normalization/send → no duplicates; tenant isolation extended to all new resources; real Graph API profile-fetch smoke test; full send pipeline proven against a local HTTP stub |
| **3 (this engagement, done)** | **AI sales**: business profile, products/services, knowledge base + pgvector RAG, AI provider abstraction, structured output, tools, usage tracking, cost controls | **AI responses are schema-validated, tenant-scoped retrieval proven, cost limits enforced** ✅ |
| **4 (this engagement, done)** | **CRM**: contacts, leads, pipelines, stages, activities, tasks, tags, assignments; AI tools wired to CRM | **AI actions mutate CRM only through controlled tools** ✅ |
| **5 (this engagement, done)** | **Follow-ups & automations**: durable follow-up scheduler, event-driven automation engine, cancellation, business-hours/timezone logic | **No infinite loops/duplicate actions under the concurrency test matrix** ✅ |
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

## What "done" means for Phase 3 specifically

1. `AIProvider`/`EmbeddingProvider` abstraction (`packages/ai`) with a concrete Anthropic (chat, tool use) and Voyage AI (embeddings) implementation — model is always a per-call parameter (never hardcoded), overridable per org via `BusinessProfile.defaultModel`, so swapping providers/models never requires a code change. Only `apps/worker-ai` holds these credentials; `apps/api` never calls an external LLM/embedding provider synchronously inside a request.
2. Business profile, products, services, and a pgvector-backed knowledge base are manageable via `apps/api` (gated on the `manageAI` capability); `docker-compose.yml`/`docker-compose.test.yml` run `pgvector/pgvector:pg16`.
3. Inbound customer messages on an `AI_ACTIVE` conversation trigger the AI sales agent via the same transactional-outbox pattern as Phase 2 (`message.inbound_received` → `ai-responses` queue → `apps/worker-ai`); the agent's final answer is a **schema-validated structured reply** (Zod, via a terminating `submit_reply` tool) after a bounded tool-calling loop over tenant-scoped, read-only tools (`searchKnowledge`, `findProduct`, `getProductPrice`, `findService`, `getServicePrice`, `getOpeningHours`).
4. The agent's reply is persisted as an outbound `Message` and dispatched through the **existing, unmodified** Phase 2 send pipeline (`worker-messaging`) — no new send path was introduced.
5. Usage (tokens, cache-read tokens, model) and cost (USD cents, via a per-model pricing table) are recorded per AI turn on `AiResponse`, which also serves as the idempotency claim (`triggerMessageId` unique constraint) preventing double-processing/double-replying, proven under concurrent claims.
6. Cost control: a configurable per-org `monthlyCostCapCents` pauses the conversation (and stops calling the AI provider entirely) once the org's monthly spend reaches the cap — proven without ever invoking a real/scripted AI call once capped.
7. Tenant isolation extended and re-proven for `BusinessProfile`, `Product`, `Service`, `KnowledgeChunk`, and `AiResponse`; `searchKnowledge` retrieval proven tenant-scoped and similarity-ordered against real pgvector.
8. **Explicitly out of scope, deferred to later phases**: CRM-backed AI tools/actions (`createLead`, `updateLeadStage`, `addTag` — implemented in Phase 4, see below), Stripe-based real billing/entitlement enforcement (Phase 7; the cost cap here is a simple configurable ceiling, not a billing plan), follow-up scheduling/automations (Phase 5), multi-provider AI failover (only Anthropic is wired concretely, though the interface is provider-agnostic), streaming AI responses to a realtime inbox UI (no realtime UI yet).

## What "done" means for Phase 4 specifically

1. `Lead`, `Pipeline`, `PipelineStage`, `Activity`, `Task`, `Tag`, `LeadTag` tables (all `organizationId`-scoped) plus a `ContactsModule` closing a small Phase 2 gap (contacts existed since Phase 2 but were never exposed over the API). Every mutating route gated on the existing `manageCRM` capability - no new capability needed.
2. One pipeline per org, auto-created lazily with 5 default stages (`New → Contacted → Qualified → Won/Lost`) via `getOrCreateDefaultPipeline` (`packages/database`), proven race-safe under two concurrent first-ever calls for the same brand-new org (exactly one `Pipeline` row).
3. The AI sales agent (`apps/worker-ai`) gained three tenant-scoped read tools (`getContactLeads`, `getPipelineStages`, `getTags`) and three declarative mutating actions on its final structured reply (`CREATE_LEAD`, `UPDATE_LEAD_STAGE`, `ADD_TAG`), extending the `AiReplySchema.actions` discriminated union alongside the existing `REQUEST_HUMAN_TAKEOVER` - proven live against a real customer message ("I want to order a custom wedding cake for 80 guests") which the agent correctly turned into a real `Lead` plus a `SYSTEM` `Activity`, without ever inventing a lead/stage/tag id.
4. Every AI-proposed action re-validates its referenced `leadId`/`stageId`/`tagId` against the calling organization before mutating anything; a hallucinated or cross-tenant id is skipped silently (proven under test) rather than crashing or blocking the customer-facing reply from sending.
5. AI can only apply *existing* tags (via `getTags`), never invent new ones - a product decision to avoid tag-name spam from the model.
6. Backend-only, per the user's explicit call - no CRM web UI this phase (`apps/web` is still the Phase 1 shell).
7. Tenant isolation extended and re-proven for `Contact`, `Lead`, `Pipeline`, `Task`, `Tag`.

## What "done" means for Phase 5 specifically

1. Two structurally different mechanisms, both implemented: `FollowUp` (time-driven - `scheduledFor` polled by a new `FollowUpDispatcherService`, an exact structural mirror of Phase 2's `OutboxDispatcherService`) and `Automation` (event-driven - reuses the existing transactional outbox unchanged, via two new `OutboxEventType`s: `lead.created`, `lead.stage_changed`). New app `apps/worker-automations` consumes both resulting queues (`follow-ups`, `automations`), per `docs/architecture/queue-topology.md`'s original target map.
2. Durable, race-safe scheduling: `FollowUp`'s atomic claim is `PENDING → SENDING` (mirrors `Message`'s send claim from Phase 2); `Automation`'s idempotency claim is `AutomationExecution`'s `@@unique([automationId, triggerEventId])` (mirrors `AiResponse.triggerMessageId`) - both proven safe under concurrent dispatch/processing.
3. No-infinite-loop guarantee is architectural, not runtime cycle-detection: none of `Automation`'s action types (`CREATE_FOLLOW_UP`, `CREATE_TASK`, `ADD_TAG`) can produce a `lead.created`/`lead.stage_changed` event, so no automation in this phase's trigger/action set can ever re-trigger itself or another automation.
4. Business-hours/timezone logic (`resolveNextSendTime` in `packages/database`, using `luxon` for DST-safe timezone math) adjusts a requested send time forward to the org's next open window, evaluated once at scheduling time; fails open (returns the unadjusted time) if hours/timezone are unset or malformed.
5. Cancellation: manual (`PATCH .../follow-ups/:id/cancel`) and automatic (moving a lead to a `Won`/`Lost` stage cancels its `PENDING` follow-ups, both via the API and via the AI's `UPDATE_LEAD_STAGE` action) - proven under test.
6. The AI sales agent gained a fourth declarative action, `SCHEDULE_FOLLOW_UP` (extending the same `AiReplySchema.actions` discriminated union from Phase 4), capped at 30 days out, with an optional `leadId` that falls back to the contact's most-recently-created lead - proven live: given "I need to think about it for a couple of days," the agent scheduled a real follow-up 2 days out with a message it wrote itself, composing correctly alongside an independently-configured `LEAD_CREATED` automation firing on the same new lead.
7. `manageAutomations` (already existed in `packages/permissions`, not granted to AGENT) gates the `AutomationsModule`; `manageCRM` (granted to AGENT) gates one-off `FollowUp` scheduling - a deliberate privilege split between "configuring rules that fire unattended" and "day-to-day CRM work."
8. Tenant isolation extended and re-proven for `FollowUp`, `Automation`, `AutomationExecution`.
9. Backend-only, consistent with Phases 2-4 - no automations/follow-ups web UI yet.
