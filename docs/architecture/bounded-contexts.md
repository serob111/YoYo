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

Owns leads, pipelines, activities, tasks, tags (`ContactsModule` ended up living here too - Phase 2 designed it under Messaging but never implemented it, so Phase 4 added it since CRM needed contact read access first). AI tool calls mutate CRM only through the declarative `CREATE_LEAD`/`UPDATE_LEAD_STAGE`/`ADD_TAG` actions on the agent's final structured reply (see ADR-0005), never live tool calls mid-loop. `LeadStageChanged`-style events for the Automations context are not emitted yet - deferred until Phase 5 exists to consume them.

- `ContactsModule`, `PipelinesModule`, `LeadsModule`, `TasksModule`, `TagsModule`

## Automations & Follow-ups (Phase 5 — designed, not implemented)

Owns the event-driven automation engine and the follow-up scheduler. Subscribes to domain events from Messaging/CRM/Content; never mutates their tables directly — it calls their service interfaces or enqueues jobs that do.

- `AutomationsModule`, `FollowUpsModule`

## Content & Publishing (Phase 6 — designed, not implemented)

Owns content generation, the approval workflow, scheduling, and publishing to Instagram/TikTok through the provider abstraction (`docs/architecture/provider-abstraction.md`).

- `ContentModule`, `PublishingModule`, `MediaModule`, `ContentCalendarModule`

## Billing (Phase 7 — designed, not implemented)

Owns Stripe integration, entitlements, and usage accounting. Every other context asks `EntitlementsModule` "is this allowed / is there budget left" rather than encoding plan logic itself.

- `BillingModule`, `EntitlementsModule`, `UsageModule`

## Cross-cutting (grows across phases)

- `AnalyticsModule`, `AuditModule` (already in Phase 1), `NotificationsModule` (email now, more channels later), `HealthModule`

## Rule for all contexts

A context may read another context's data only through that context's public service interface (or a normalized event), never through direct repository/Prisma access into tables it doesn't own. This is what keeps "modular monolith" from decaying into "one big ball of mud" as contexts are added.
