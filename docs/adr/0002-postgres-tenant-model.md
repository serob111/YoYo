# ADR-0002: Shared PostgreSQL database, explicit `organizationId` per row

## Status
Accepted

## Context
Multi-tenant data isolation is the highest-consequence correctness requirement in this system — a leak of one business's customer data to another is catastrophic. Options considered: database-per-tenant, schema-per-tenant, or a single shared schema with `organizationId` on every tenant-owned row plus row-level enforcement in application code (optionally backed later by Postgres RLS).

## Decision
Single shared PostgreSQL database/schema. Every tenant-owned table carries `organizationId` directly. Access is enforced through `TenantAwareRepository` methods that require `organizationId` as an explicit argument, fed only from a server-validated `TenantContext` (see `docs/architecture/tenant-model.md`) — never from a client-trusted value.

## Consequences
- Operationally simple at this scale: one database to back up, migrate, and monitor, versus thousands of tenant databases/schemas that would each need migration fan-out.
- Isolation correctness depends on application-layer discipline (repository shapes, guards, and the tenant-isolation test suite) rather than the database engine alone. This is an accepted risk, mitigated by: repository method signatures that make the unscoped-query bug hard to write, a guard that resolves `organizationId` in exactly one place, and mandatory tests proving isolation per resource before Phase 1 ships.
- Postgres Row-Level Security is a documented future hardening option (defense in depth) if/when the team wants a database-enforced backstop in addition to the application-layer guarantee — not implemented in Phase 1 to avoid adding RLS policy maintenance before there's a second real tenant-owned table beyond the Identity & Access set.
- Database-per-tenant remains available later for a specific enterprise customer with strict isolation/compliance requirements, without changing the application code, since queries are already scoped by `organizationId`.
