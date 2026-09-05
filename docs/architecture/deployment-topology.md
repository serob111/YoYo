# Deployment Topology

## Units

Every component runs in a container and is stateless (see `docs/architecture/overview.md`):

| Unit | Phase | Scales for |
|---|---|---|
| `web` | 1 | user traffic |
| `api` | 1 | request volume |
| `worker-email` | 1 | email send volume (low) |
| `worker-webhooks` | 2 | inbound webhook burst volume |
| `worker-messaging` | 2 | inbound/outbound message volume |
| `worker-ai` | 3 | concurrent AI operations |
| `worker-publishing` | 6 | scheduled post volume |
| `worker-media` | 6 | media processing volume |
| `worker-automations` | 5 | automation/follow-up volume |

Each is an independent deployment/replica count — e.g. `worker-ai` can run 10 replicas while `worker-publishing` runs 3, without touching the API's scaling.

## Environments

Four separate environments, each with its own database, Redis instance, object storage bucket(s), and provider app credentials (Meta app, TikTok app, Stripe mode, AI provider keys): `local`, `test`, `staging`, `production`. Local and test both run against Docker Compose services; test uses an ephemeral compose project (no persisted volumes) so CI runs are isolated and repeatable.

## What exists today vs. deferred

Phase 1 ships `docker-compose.yml` for local dev and CI service containers, plus Dockerfiles for `web` and `api`. It does **not** ship a staging/production deployment target (no cloud account, orchestrator, or hosting decision has been made) — CI runs install/lint/typecheck/test/build and stops there. Adding a real deploy step is a deliberate future decision, not an oversight; faking one now (e.g. a no-op "deploy" step) would create false confidence.

## Graceful shutdown

API processes drain in-flight requests before exiting (platform-dependent; Nest's shutdown hooks are wired even though no orchestrator enforces the grace period yet). Workers stop pulling new jobs, let in-flight jobs finish, then close DB/Redis connections — established now with the one Phase 1 worker so the pattern carries forward.

## Connection pooling

Each API/worker replica opens a bounded Prisma connection pool (env-configurable size). As replica counts grow in later phases, total connections against PostgreSQL must be planned against the database's `max_connections` — a external pooler (e.g. PgBouncer) is a documented future step once replica counts make it necessary, not a Phase 1 requirement at this scale.
