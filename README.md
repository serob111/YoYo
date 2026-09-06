# Yoyo — AI Sales & Social Media Employee

Multi-tenant SaaS platform. See `docs/architecture/` for the system design and `docs/adr/` for key decisions. This repository currently implements **Phase 1 (Foundation)**, **Phase 2 (Instagram messaging)**, **Phase 3 (AI sales)**, **Phase 4 (CRM)**, **Phase 5 (Follow-ups & automations)**, and **Phase 6 (Content & publishing)** — see `docs/architecture/mvp-scope.md` for what each phase does and doesn't include.

## Stack

pnpm workspaces + Turborepo monorepo. Next.js (`apps/web`), NestJS (`apps/api`), and seven BullMQ workers (`apps/worker-email`, `apps/worker-webhooks`, `apps/worker-messaging`, `apps/worker-ai`, `apps/worker-automations`, `apps/worker-content`, `apps/worker-publishing`), PostgreSQL + pgvector via Prisma (`packages/database`), Redis, and MinIO for local S3-compatible storage (`packages/storage`). The AI provider abstraction (`packages/ai`) wraps Anthropic (chat), Voyage AI (embeddings), and Gemini (image editing) — only `apps/worker-ai`/`apps/worker-content` hold those credentials. `apps/worker-automations` fires event-driven `Automation` rules and executes durably-scheduled `FollowUp`s, both feeding back into the existing outbound-message pipeline unchanged. `apps/worker-content` generates captions and can enhance uploaded photos into marketing banners; `apps/worker-publishing` publishes approved `ContentItem`s to Instagram/TikTok through `packages/integrations`'s `PublishingProvider`.

## Local setup

1. `cp .env.example .env` and fill in real values (generate `SESSION_COOKIE_SECRET`/`ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Instagram/Meta and TikTok variables can stay blank until you have a real app — the app boots fine without them; only the OAuth/webhook routes need them. `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`/`GEMINI_API_KEY` can also stay blank, but `apps/worker-ai`/`apps/worker-content` will refuse to start without them (every other app/worker runs fine either way).
2. `docker compose up -d` — starts Postgres (with the `vector` extension available), Redis, MinIO.
3. `pnpm install`
4. `pnpm --filter @yoyo/database db:generate && pnpm --filter @yoyo/database db:migrate`
5. `pnpm dev` — runs `apps/web`, `apps/api`, and all seven workers together via Turborepo (`worker-ai`/`worker-content` will exit immediately if their API keys are unset — run them separately once configured, e.g. `pnpm --filter @yoyo/worker-ai dev`).

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
