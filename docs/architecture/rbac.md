# RBAC & Permissions

## Roles

`OWNER`, `ADMIN`, `MANAGER`, `AGENT`, `VIEWER` — assigned per `OrganizationMember` row, so a user can hold different roles in different organizations.

## Capabilities

The full capability set anticipated across all phases (Phase 1 enforces only the ones with a real endpoint behind them today; the rest are defined now so the matrix doesn't get redesigned per phase):

`manageBilling`, `manageMembers`, `manageIntegrations`, `manageAI`, `manageAutomations`, `manageContent`, `publishContent`, `viewAnalytics`, `manageCRM`, `replyConversation`, `takeOverConversation`

## Role → capability matrix

| Capability | OWNER | ADMIN | MANAGER | AGENT | VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|
| manageBilling | ✅ | ✅ | | | |
| manageMembers | ✅ | ✅ | | | |
| manageIntegrations | ✅ | ✅ | ✅ | | |
| manageAI | ✅ | ✅ | ✅ | | |
| manageAutomations | ✅ | ✅ | ✅ | | |
| manageContent | ✅ | ✅ | ✅ | | |
| publishContent | ✅ | ✅ | ✅ | | |
| viewAnalytics | ✅ | ✅ | ✅ | ✅ | ✅ |
| manageCRM | ✅ | ✅ | ✅ | ✅ | |
| replyConversation | ✅ | ✅ | ✅ | ✅ | |
| takeOverConversation | ✅ | ✅ | ✅ | ✅ | |

`OWNER` is a superset of `ADMIN` and additionally cannot be removed/demoted by an `ADMIN` (only by themself transferring ownership — enforced in `MembersModule`, not yet built for transfer in Phase 1 since there's only ever one `OWNER` created at org-creation time).

## `PermissionsService`

Framework-agnostic policy service in `packages/permissions`:

```ts
type Capability = 'manageBilling' | 'manageMembers' | /* ... */;

interface PermissionsService {
  can(role: OrganizationRole, capability: Capability): boolean;
}
```

Consumed in the API via a `@RequireCapability('manageMembers')` decorator + guard that reads the caller's role for the current `TenantContext.organizationId` (resolved from `OrganizationMember`, not from a client-supplied value) and calls `PermissionsService.can(...)`.

## Explicit rule

No `if (user.role === 'ADMIN')` checks scattered in controllers/services. Every authorization decision goes through `PermissionsService.can()` so the matrix above is the single source of truth and is unit-testable in isolation.
