# ADR-0005: AI provider abstraction, terminating-tool structured output, and cost enforcement

## Status
Accepted — implemented in Phase 3 (`packages/ai`, `apps/worker-ai`).

## Context
The brief requires an AI sales agent whose replies are schema-validated, that supports multiple LLM vendors without a rewrite, that can look up real business data via tools, and whose cost is bounded per org. Three concrete design questions needed an answer before implementation:

1. How does the agent produce a schema-validated final reply while also using tools mid-conversation?
2. How does an inbound customer message reach the AI worker, given the existing transactional-outbox pattern (ADR-0004) is API-only?
3. What does "cost limits enforced" mean before Billing (Phase 7) exists?

## Decisions

**Terminating tool instead of `output_config.format`.** The agent calls ordinary read-only tools (`searchKnowledge`, `findProduct`, etc.) during the loop, then must call a special `submit_reply` tool whose Zod-validated input *is* the structured final answer (`{reply, intent, needsHuman, actions}`). This gives one unambiguous loop-exit condition and avoids any question about how normal tool use interacts with `output_config.format` in the same request — the two features are never combined.

**Model is always a per-call parameter.** `AIProvider.complete()` takes `model` as an argument; nothing in `packages/ai` hardcodes a model string. `BusinessProfile.defaultModel` (per-org override) and `AI_DEFAULT_MODEL` (fleet-wide default, `apps/worker-ai` env) supply it. Switching models or adding a second vendor never requires touching the agent loop.

**Outbox emission is inlined in the worker, not imported from `apps/api`.** `OutboxService` is `apps/api`-local. `apps/worker-webhooks/src/normalize.ts` and `apps/worker-ai/src/generate-reply.ts` both need to write `OutboxEvent` rows from inside a worker process, so both do a direct `tx.outboxEvent.create(...)` in the same transaction as their business row, rather than reaching across app boundaries. The `OutboxEventType` union (`apps/api/src/common/outbox.service.ts`) and the dispatcher's exhaustive switch (`outbox-dispatcher.service.ts`) are still the single source of truth for valid event types and where they route.

**The AI reply re-enters the existing Phase 2 send pipeline unchanged.** `generateAiReply` creates an `OUTBOUND`/`PENDING` `Message` (`senderType: AI`) and a `message.outbound_pending` outbox row — the exact shape `messages.service.ts` already produces for human-sent replies. `worker-messaging` needed zero changes.

**Cost enforcement is a configurable ceiling, not billing.** `BusinessProfile.monthlyCostCapCents` (nullable = unlimited) is compared against the org's current-month `SUM(AiResponse.costCents)` before calling the AI provider at all. Hitting it pauses the conversation (`automationState = PAUSED`) and inserts a `SYSTEM` message — no Stripe/plan-tier integration, since that's explicitly Phase 7's job.

**`AiResponse.triggerMessageId`'s unique constraint is the idempotency claim**, mirroring the unique-constraint-as-claim pattern already used by `ContactIdentity`/`ConnectedAccount` in Phase 2 — a duplicate `create()` fails with P2002 and is treated as "already being/been handled," proven under concurrent invocation the same way Phase 2 proved webhook dedup.

## Consequences
- Adding a second AI vendor means a new `packages/ai/src/<vendor>/` implementation of `AIProvider`/`EmbeddingProvider` plus a pricing-table entry — no changes to `sales-agent.ts`, `apps/worker-ai`, or the schema.
- CRM-dependent tools/actions (`createLead`, `updateLeadStage`, `addTag`) are not offered by the agent yet — `AiReplySchema.actions` only allows `REQUEST_HUMAN_TAKEOVER` until Phase 4 exists to receive them.
- Because embeddings (Voyage) and chat (Anthropic) are two different vendors by design, `packages/ai` intentionally has two independent provider interfaces rather than one combined "AI vendor" interface — a business could plausibly use Anthropic for chat and OpenAI for embeddings, or vice versa.
