import type { PrismaClient } from "@yoyo/database";

// Order matters: children before parents. Extend this list as new tenant tables are added.
const TABLES_IN_DELETE_ORDER = [
  "content_media_assets",
  "content_items",
  "follow_ups",
  "automation_executions",
  "automations",
  "lead_tags",
  "activities",
  "tasks",
  "leads",
  "pipeline_stages",
  "pipelines",
  "tags",
  "ai_responses",
  "outbox_events",
  "messages",
  "provider_webhook_events",
  "conversations",
  "contact_identities",
  "contacts",
  "connected_accounts",
  "knowledge_chunks",
  "products",
  "services",
  "business_profiles",
  "audit_logs",
  "magic_link_tokens",
  "organization_members",
  "sessions",
  "organizations",
  "users"
];

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    TABLES_IN_DELETE_ORDER.map((table) => prisma.$executeRawUnsafe(`DELETE FROM "${table}"`))
  );
}
