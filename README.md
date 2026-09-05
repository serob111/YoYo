# Yoyo — AI Sales & Social Media Employee

Multi-tenant SaaS platform. See `docs/architecture/` for the system design and `docs/adr/` for key decisions. This repository currently implements **Phase 1 (Foundation)** only — see `docs/architecture/mvp-scope.md` for what that does and doesn't include.

## Stack

pnpm workspaces + Turborepo monorepo. Next.js (`apps/web`), NestJS (`apps/api`), a BullMQ email worker (`apps/worker-email`), PostgreSQL via Prisma (`packages/database`), Redis, and MinIO for local S3-compatible storage.

## Local setup

1. `cp .env.example .env` and fill in real values (generate `SESSION_COOKIE_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. `docker compose up -d` — starts Postgres, Redis, MinIO.
3. `pnpm install`
4. `pnpm --filter @yoyo/database db:generate && pnpm --filter @yoyo/database db:migrate`
5. `pnpm dev` — runs `apps/web`, `apps/api`, and `apps/worker-email` together via Turborepo.

Web: http://localhost:3000. API: http://localhost:4000. MinIO console: http://localhost:9001.

## Testing

- `pnpm test` — unit tests across all packages/apps.
- Integration tests (including the tenant-isolation suite) run against ephemeral services:
  ```
  docker compose -f docker-compose.test.yml up -d
  pnpm --filter @yoyo/database db:migrate:deploy
  pnpm --filter @yoyo/api test:integration
  ```

## Documentation

- `docs/architecture/overview.md` — system diagram and component responsibilities
- `docs/architecture/tenant-model.md` — how tenant isolation is enforced
- `docs/architecture/rbac.md` — roles and capabilities
- `docs/architecture/mvp-scope.md` — phase boundaries and what "done" means for Phase 1
- `docs/adr/` — architecture decision records
