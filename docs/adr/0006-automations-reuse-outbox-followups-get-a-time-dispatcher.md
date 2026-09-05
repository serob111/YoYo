# ADR-0006: Automations reuse the existing outbox; follow-ups get a new time-based dispatcher

## Status
Accepted — implemented in Phase 5 (`apps/worker-automations`, `apps/api/src/common/follow-up-dispatcher.service.ts`).

## Context
Phase 5 needs two related but structurally different capabilities: an event-driven automation engine ("when a lead is created/changes stage, do X") and a durable follow-up scheduler ("send this at time X"). `docs/architecture/bounded-contexts.md` had already named both (`AutomationsModule`, `FollowUpsModule`) and flagged that CRM would eventually need to emit `LeadStageChanged`-style events for this context to consume, without specifying the mechanism.

## Decisions

**Automations reuse the transactional outbox (ADR-0004) unchanged, rather than a new event bus.** `LeadsService.create`/`moveStage` and `apps/worker-ai`'s `applyAiActions` (`CREATE_LEAD`/`UPDATE_LEAD_STAGE`) now emit `lead.created`/`lead.stage_changed` `OutboxEvent` rows in the same transaction as the `Lead` mutation - two new cases in the existing `OutboxEventType` union and the dispatcher's exhaustive switch, routed to a new `automations` BullMQ queue. No new durability mechanism was needed because the outbox already solves "the mutation committed but the downstream trigger must not be silently lost."

**Follow-ups get their own poller, `FollowUpDispatcherService`, because they aren't triggered by a mutation.** A follow-up fires when a clock reaches a value, not when a row changes - `SELECT ... WHERE scheduledFor <= now()` has no outbox-row equivalent to attach to. `FollowUpDispatcherService` is a structural clone of `OutboxDispatcherService` (same `FOR UPDATE SKIP LOCKED` claim, same `tick()`/`stopPolling()` test hooks) but polls every 30s instead of 500ms (follow-ups are minute-granularity; the outbox protects sub-second-critical chains) and only hands off to BullMQ - it never marks the row "done," since that's the executing worker's job (mirroring `Message`'s `PENDING → SENDING` claim, not the outbox's `PENDING → DISPATCHED` claim).

**The no-infinite-loop guarantee is architectural, not a runtime cycle-detector.** `Automation`'s three action types (`CREATE_FOLLOW_UP`, `CREATE_TASK`, `ADD_TAG`) were deliberately chosen so that none of them ever produces a `lead.created` or `lead.stage_changed` event - the only two trigger types that exist. A cycle is structurally impossible in this initial set, not merely avoided by convention. Adding a new trigger type or action type later must re-verify this invariant explicitly (called out in a schema comment on `AutomationExecutionStatus`/`Automation`).

**Two separate idempotency claims, both unique-constraint-as-claim (the pattern established across every phase since Phase 2):** `AutomationExecution.@@unique([automationId, triggerEventId])` (mirrors `AiResponse.triggerMessageId`) for automations, `FollowUp.status: PENDING → SENDING` (mirrors `Message`'s send claim) for follow-ups.

**Capability split**: `manageAutomations` (already existed in `packages/permissions`, granted to OWNER/ADMIN/MANAGER but not AGENT) gates `AutomationsModule` - configuring rules that fire unattended is treated as a higher-privilege action. `manageCRM` (granted to AGENT too) gates one-off `FollowUpsModule` scheduling/cancellation - scheduling a single follow-up for your own lead is ordinary day-to-day CRM work, the same privilege level as creating a `Task`.

**Business-hours adjustment happens once, at scheduling time, never re-evaluated at dispatch.** `resolveNextSendTime` (`packages/database`, using `luxon` for DST-correct timezone math) is called by every `FollowUp` producer (`FollowUpsService`, `apps/worker-automations`'s `CREATE_FOLLOW_UP` action, `apps/worker-ai`'s `SCHEDULE_FOLLOW_UP` action) at creation time. If the org's business hours change after a follow-up is already scheduled, the already-computed `scheduledFor` does not retroactively move - an accepted simplification that avoids a second timezone-math pass at dispatch time.

## Consequences
- Adding a new automation trigger (e.g. `MESSAGE_RECEIVED`) means: emit a new outbox event type from wherever that mutation happens, add it to the dispatcher's switch and to `AutomationTriggerType`, and re-verify no existing action type could produce that same event (the no-cycle invariant).
- `apps/worker-automations` needs zero AI/external-provider credentials (`automationsWorkerEnvSchema` is just `coreWorkerEnvSchema`) - it only reuses `worker-messaging`'s existing send pipeline and internal Prisma-backed tables.
- The AI's `SCHEDULE_FOLLOW_UP` action and a human/automation-created `FollowUp` are indistinguishable at dispatch time (both are just `FollowUp` rows) - proven live: an AI-scheduled follow-up and an independently-configured `LEAD_CREATED` automation's follow-up fired correctly side by side on the same lead without conflict.
