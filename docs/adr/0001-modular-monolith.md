# ADR-0001: Modular monolith over microservices at launch

## Status
Accepted

## Context
The target scale (1,000+ orgs, 10M+ messages over time, hundreds of concurrent AI ops at peak) is often used to justify a microservices architecture from day one. The brief explicitly rejects that: reliability, tenant isolation, and correctness matter more than architectural fashion, and a small team needs to operate this.

## Decision
Build one modular monolith (`apps/api`) with strict internal module boundaries (see `docs/architecture/bounded-contexts.md`), plus independently-deployable background workers from day one. Do not split the request/response API surface into separate services.

## Consequences
- Transactional consistency within a bounded context is free (no distributed transactions/sagas needed for e.g. "update lead + write activity + emit event").
- One deployable API unit is simpler to test, deploy, and reason about for a small team.
- Independent scaling need is already met for the async workload (each worker type scales separately); the API itself scales horizontally as stateless replicas.
- If a specific module later needs independent scaling, failure isolation, or a separate deployment cadence that measurement shows the monolith can't provide, it can be extracted because module boundaries (service interfaces, no cross-module repository access) are enforced from the start — extraction is a network-boundary change, not a rewrite.
- Risk accepted: internal discipline (no reaching into another module's repositories) is enforced by convention/code review, not a hard runtime boundary, until/unless it's worth adding tooling for that.
