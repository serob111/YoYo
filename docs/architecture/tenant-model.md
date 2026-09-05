# Tenant Model

## Tenant root

`Organization` is the tenant root. A `User` can belong to multiple organizations via `OrganizationMember`. All business data belongs to exactly one organization.

## Rule

Every tenant-owned table carries `organizationId` directly (not just reachable via a join chain). This is deliberate redundancy: it means every query that touches tenant data can and must filter on `organizationId` at that table, without trusting that a parent row was already scoped correctly.

## How `organizationId` reaches a request — never trust the client

`organizationId` is **never** taken as a bare, trusted value from a route param, query string, or request body and used directly in a query. The flow is:

1. The user authenticates → `Session` resolves to a `User`.
2. The route includes an org identifier (e.g. `/organizations/:orgId/members`).
3. A guard (`TenantContextGuard`) loads the `OrganizationMember` row for `(orgId, userId)` and checks `status = ACTIVE`. If it doesn't exist or isn't active, the request fails closed with 403/404 — **before** any handler or repository call runs.
4. Only after that check does the resolved, *verified* `organizationId` get attached to the request-scoped `TenantContext` that repositories read from.

This means a handler can never accidentally use an org id the caller supplied without it having been checked — there is exactly one place org membership is validated, and repositories don't re-derive it from the request themselves.

## `TenantContext`

An `AsyncLocalStorage`-backed context (see `packages/permissions` / api middleware) carrying:

- `userId` — from the session
- `requestId` — generated per request, threaded into logs and audit entries
- `organizationId` — set only after `TenantContextGuard` validates membership; absent for routes that aren't org-scoped (e.g. `/auth/login`)

## `TenantAwareRepository`

Tenant-owned data access goes through repository methods that take `organizationId` as an explicit, required argument — not an optional filter. Example shape:

```ts
class MembersRepository {
  findMany(organizationId: string, cursor?: string) { ... }
  findByIdOrThrow(organizationId: string, memberId: string) { ... }
}
```

A call like `prisma.organizationMember.findUnique({ where: { id } })` with no `organizationId` in the `where` clause is the exact bug class this prevents — the repository signature makes it impossible to forget the filter, since there's no id-only method to call by accident.

## Enforcement today vs. later

Phase 1 enforces this via the guard + repository method shapes, and via the tenant-isolation test suite (`docs/architecture/mvp-scope.md`) that must pass before Phase 1 is considered done. A stricter enforcement mechanism (e.g. a custom ESLint rule banning bare `findUnique({ where: { id } })` on tenant tables, or Postgres row-level security) is a future hardening step, not a Phase 1 blocker — noted here so it isn't forgotten.

## Test requirement

For every tenant-owned resource, there is a test proving: a user in Organization A, given a known valid UUID belonging to Organization B, gets 403/404 and no data in the response body. See the Phase 1 plan's tenant-isolation suite.
