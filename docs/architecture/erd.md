# Entity-Relationship Model

## Phase 1 entities (implemented now)

```mermaid
erDiagram
    User ||--o{ Session : "has"
    User ||--o{ MagicLinkToken : "requests"
    User ||--o{ OrganizationMember : "is a"
    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ AuditLog : "scopes"
    User ||--o{ AuditLog : "acts as"

    User {
        uuid id PK
        string email UK
        string passwordHash "nullable"
        string name
        string status
        timestamp emailVerifiedAt "nullable"
        timestamp createdAt
        timestamp updatedAt
    }

    Session {
        uuid id PK
        uuid userId FK
        timestamp createdAt
        timestamp expiresAt
        timestamp revokedAt "nullable"
        string ipAddress "nullable"
        string userAgent "nullable"
    }

    MagicLinkToken {
        uuid id PK
        uuid userId FK
        string tokenHash UK
        timestamp expiresAt
        timestamp consumedAt "nullable"
        timestamp createdAt
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        string status
        timestamp createdAt
        timestamp updatedAt
    }

    OrganizationMember {
        uuid id PK
        uuid organizationId FK
        uuid userId FK
        string role "OWNER|ADMIN|MANAGER|AGENT|VIEWER"
        string status "INVITED|ACTIVE|REMOVED"
        uuid invitedByUserId FK "nullable"
        timestamp invitedAt
        timestamp joinedAt "nullable"
    }

    AuditLog {
        uuid id PK
        uuid organizationId FK "nullable"
        uuid actorId FK "nullable"
        string action
        string entityType
        string entityId
        json metadata
        string requestId
        timestamp createdAt
    }
```

Constraints worth calling out:

- `OrganizationMember(organizationId, userId)` is unique — a user has at most one membership row per org.
- `Session.userId` is indexed; sessions are looked up by opaque session id (the cookie value), never enumerated.
- `AuditLog.organizationId` is nullable to allow account-level events (e.g. a user's own login) that aren't scoped to a single org; every org-scoped mutation writes a non-null row.

## Forward-look: tables introduced in later phases (not implemented yet)

Listed here so Phase 1's schema choices (naming, `organizationId` placement, id types) don't need to change when these land.

| Phase | Tables |
|---|---|
| 2 — Instagram/WhatsApp messaging | `ConnectedAccount`, `ProviderWebhookEvent`, `Contact`, `ContactIdentity`, `Conversation`, `ConversationParticipant`, `Message`, `OutboxEvent` |
| 3 — AI sales | `BusinessProfile`, `Product`, `Service`, `KnowledgeSource`, `KnowledgeDocument`, `KnowledgeDocumentVersion`, `KnowledgeChunk` (+ pgvector embedding column), `AIAgentConfig`, `AIUsage`, `ConversationSummary` |
| 4 — CRM | `Lead`, `Pipeline`, `PipelineStage`, `Activity`, `Task`, `Tag`, `LeadTag` |
| 5 — Follow-ups / automations | `FollowUp`, `Automation`, `AutomationExecution` |
| 6 — Content / TikTok | `ContentIdea`, `ContentPost`, `ContentAsset`, `ScheduledPost`, `PublishingExecution`, `MediaAsset` |
| 7 — Billing | `BillingCustomer`, `Subscription`, `SubscriptionItem`, `Entitlement`, `UsageCounter` |
| Cross-cutting | `Notification`, additional `AuditLog` action types |

Every table in this list is tenant-owned and will carry `organizationId` directly, per `docs/architecture/tenant-model.md`.
