# Bounded Contexts & Module Map

Each context maps to a NestJS module namespace inside `apps/api/src` and, where it has logic reusable by workers, a package under `packages/`. Controllers stay thin; domain logic lives in services within the context; contexts talk to each other through explicit service interfaces, not by reaching into each other's repositories.

## Identity & Access (Phase 1 — implemented)

Owns authentication, users, organizations, membership, permissions, and audit logging. Everything else in the system depends on this context for "who is making this request, in which organization, allowed to do what."

- `AuthModule` — signup, login, logout, magic link, password reset, email verification, sessions
- `UsersModule` — user profile
- `OrganizationsModule` — organization CRUD (create/get/list-mine)
- `MembersModule` — invite/accept/list/change-role/remove
- `PermissionsModule` — capability resolution (`packages/permissions`)
- `AuditModule` — audit log writes/reads

## Messaging (Phase 2 — designed, not implemented)

Owns connected social accounts, inbound/outbound normalization, conversations, and messages. Depends on Identity & Access for tenant context; exposes normalized events (`InboundMessageReceived`, etc.) that the CRM and AI contexts consume — those contexts never parse raw provider payloads.

- `IntegrationsModule`, `InstagramModule`, `WhatsAppModule`, `TikTokModule` (connection/OAuth only here)
- `ConversationsModule`, `MessagesModule`, `ContactsModule`
- `WebhooksModule` (ingestion → `ProviderWebhookEvent` → queue, per `docs/architecture/queue-topology.md`)

## AI (Phase 3 — designed, not implemented)

Owns the sales agent orchestration, knowledge base/RAG, and AI usage accounting. Reads from Messaging (conversation context) and CRM (lead state) through their service interfaces; never touches their tables directly. Exposes a small set of controlled tools (`packages/ai`) rather than raw data access.

- `AIModule`, `AIAgentModule`, `KnowledgeModule`, `RetrievalModule`, `AIToolsModule`

## CRM (Phase 4 — implemented)

Owns leads, pipelines, activities, tasks, tags (`ContactsModule` ended up living here too - Phase 2 designed it under Messaging but never implemented it, so Phase 4 added it since CRM needed contact read access first). AI tool calls mutate CRM only through the declarative `CREATE_LEAD`/`UPDATE_LEAD_STAGE`/`ADD_TAG` actions on the agent's final structured reply (see ADR-0005), never live tool calls mid-loop. `lead.created`/`lead.stage_changed` outbox events (the `LeadStageChanged`-style events referenced below) are emitted by `LeadsService` and consumed by the Automations context as of Phase 5.

- `ContactsModule`, `PipelinesModule`, `LeadsModule`, `TasksModule`, `TagsModule`

## Automations & Follow-ups (Phase 5 — implemented)

Owns the event-driven automation engine and the durable follow-up scheduler. `Automation` subscribes to CRM domain events (`lead.created`, `lead.stage_changed`) via the existing transactional outbox rather than a new event bus; `FollowUp` is time-driven (a `scheduledFor` row polled by `FollowUpDispatcherService`), not event-driven. Neither mutates Messaging/CRM tables directly - `apps/worker-automations` does its own tenant-scoped queries and reuses the exact same action shapes (`CREATE_FOLLOW_UP`, `CREATE_TASK`, `ADD_TAG`) already used elsewhere.

- `AutomationsModule`, `FollowUpsModule`

## Content & Publishing (Phase 6 — implemented)

Owns content generation, the approval workflow, scheduling, and publishing to Instagram/TikTok through the provider abstraction (`docs/architecture/provider-abstraction.md`). `ContentModule` covers CRUD, generation requests, and the approval workflow (submit/approve/reject/cancel/reschedule); `MediaModule` is a thin synchronous wrapper over presigned S3/MinIO URLs (`packages/storage`), since presigning is a pure local computation with no external call. A `PublishingModule`-equivalent doesn't exist as a separate module - publishing is `ContentDispatcherService` (time-polled, mirrors Phase 5's `FollowUpDispatcherService`) plus `apps/worker-publishing`. `ContentCalendarModule` from the original forward-look wasn't built - one flat per-org `ContentItem` list was sufficient this phase.

- `ContentModule`, `MediaModule`
- `apps/worker-content` (caption generation via Claude, optional AI photo enhancement via Gemini - `packages/ai`'s new `ImageEditProvider`)
- `apps/worker-publishing` (real Instagram/TikTok publish calls via `packages/integrations`'s new `PublishingProvider`)

## Billing (Phase 7 — designed, not implemented)

Owns Stripe integration, entitlements, and usage accounting. Every other context asks `EntitlementsModule` "is this allowed / is there budget left" rather than encoding plan logic itself.

- `BillingModule`, `EntitlementsModule`, `UsageModule`

## Cross-cutting (grows across phases)

- `AnalyticsModule`, `AuditModule` (already in Phase 1), `NotificationsModule` (email now, more channels later), `HealthModule`

## Rule for all contexts

A context may read another context's data only through that context's public service interface (or a normalized event), never through direct repository/Prisma access into tables it doesn't own. This is what keeps "modular monolith" from decaying into "one big ball of mud" as contexts are added.
