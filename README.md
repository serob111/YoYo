# Yoyo — AI Sales & Social Media Employee

Multi-tenant SaaS platform. See `docs/architecture/` for the system design and `docs/adr/` for key decisions. This repository currently implements **Phase 1 (Foundation)**, **Phase 2 (Instagram messaging)**, **Phase 3 (AI sales)**, and **Phase 4 (CRM)** — see `docs/architecture/mvp-scope.md` for what each phase does and doesn't include.

## Stack

pnpm workspaces + Turborepo monorepo. Next.js (`apps/web`), NestJS (`apps/api`), and four BullMQ workers (`apps/worker-email`, `apps/worker-webhooks`, `apps/worker-messaging`, `apps/worker-ai`), PostgreSQL + pgvector via Prisma (`packages/database`), Redis, and MinIO for local S3-compatible storage. The AI provider abstraction (`packages/ai`) wraps Anthropic (chat) and Voyage AI (embeddings) — only `apps/worker-ai` holds those credentials.

## Local setup

1. `cp .env.example .env` and fill in real values (generate `SESSION_COOKIE_SECRET`/`ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Instagram/Meta variables can stay blank until you have a real Meta app — the app boots fine without them; only the OAuth/webhook routes need them. `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY` can also stay blank, but `apps/worker-ai` will refuse to start without them (every other app/worker runs fine either way).
2. `docker compose up -d` — starts Postgres (with the `vector` extension available), Redis, MinIO.
3. `pnpm install`
4. `pnpm --filter @yoyo/database db:generate && pnpm --filter @yoyo/database db:migrate`
5. `pnpm dev` — runs `apps/web`, `apps/api`, and all four workers together via Turborepo (`worker-ai` will exit immediately if its API keys are unset — run `pnpm --filter @yoyo/worker-ai dev` separately once they're configured).

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
