# ADR-0003: BullMQ on Redis for background jobs, not Kafka

## Status
Accepted

## Context
The system needs durable background job processing for email (Phase 1) and, in later phases, webhook ingestion, messaging, AI orchestration, follow-ups, automations, and publishing. All of these are discrete, retryable units of work with a single logical consumer per job — not a log-streaming or multi-consumer-group replay workload.

## Decision
Use BullMQ backed by Redis for all queues, across all phases, unless a specific future requirement (e.g. multiple independent consumer groups replaying the same event stream, or sustained throughput Redis can't serve) is measured and documented.

## Consequences
- Redis is already needed for caching, rate limiting, and realtime coordination — BullMQ adds no new infrastructure dependency.
- Job semantics (retry, backoff, delay, dead-letter/failed set, concurrency limits) map directly onto the job types this system has; no event-sourcing/replay semantics are needed for the current workload.
- Operating one queue technology across every phase (rather than introducing Kafka for high-volume queues later) keeps the operational surface small for a small team.
- Trade-off accepted: BullMQ/Redis job durability depends on Redis persistence configuration (AOF/RDB) — this must be configured correctly in every environment; it is not durability-by-default the way a dedicated log-based system would be. Documented as an operational requirement, not deferred silently.
- Revisit if a future phase's measured throughput or fan-out pattern genuinely doesn't fit (see `docs/architecture/queue-topology.md` for the full target queue map).
