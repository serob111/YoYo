# ADR-0004: Transactional outbox pattern designed now, implemented starting Phase 2

## Status
Accepted

## Context
The brief requires that critical event publishing (e.g. "inbound message persisted" must reliably result in a queued AI/automation job) never lose work to the "DB commit succeeds, queue enqueue fails" failure mode. The standard fix is a transactional outbox: write the domain event to an `OutboxEvent` row in the same transaction as the business mutation, then a separate dispatcher reads outbox rows and enqueues them to BullMQ, so enqueue failure is retryable from durable state rather than silently lost.

Phase 1 has no cross-boundary domain event chain yet — the one async operation (sending an invite/magic-link email) is not on a "customer-facing, must-not-be-lost-silently" critical path the way an inbound customer message is, and a missed invite email is trivially recoverable by the user clicking "resend."

## Decision
Design the outbox pattern now (documented here and in `docs/architecture/queue-topology.md`) but do not implement an `OutboxEvent` table or dispatcher in Phase 1. Implement it starting Phase 2, when `ProviderWebhookEvent` → normalized message persistence → AI/automation trigger becomes the first genuinely critical event chain.

## Consequences
- Avoids building unused infrastructure in Phase 1 (no overengineering) while keeping the schema/module design (`organizationId`-scoped tables, service-interface boundaries between contexts) compatible with adding `OutboxEvent` without rework.
- Phase 1's email sending accepts the small, explicitly-acknowledged risk of an enqueue failure requiring a manual resend, rather than building outbox machinery to protect a low-stakes operation.
- Phase 2 planning must include the outbox table and dispatcher as a named deliverable, not an afterthought — tracked here so it isn't dropped.
