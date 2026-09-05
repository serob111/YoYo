import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url(),
  WEB_APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  SESSION_COOKIE_NAME: z.string().default("yoyo_session"),
  SESSION_COOKIE_SECRET: z.string().min(32, "SESSION_COOKIE_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 30),

  CSRF_COOKIE_NAME: z.string().default("yoyo_csrf"),

  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanFromString,

  EMAIL_FROM_ADDRESS: z.string().email().default("no-reply@example.com"),

  RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

  // Off by default even in development - the outbox/follow-up dispatchers poll
  // every 500ms/30s and would otherwise flood the console with raw SQL on every
  // tick. Flip to "true" only when actively debugging a specific query.
  PRISMA_LOG_QUERIES: booleanFromString,

  // --- Instagram / Meta (Phase 2) ---
  // Optional: the app boots and every other feature works without these. Only
  // the Instagram OAuth/webhook routes require them, and they fail with a clear
  // config error at call time (not at boot) if unset. This keeps local dev
  // possible before a Meta app exists, per docs/adr — see IntegrationsModule.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v23.0"),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required")
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

const coreWorkerEnvSchema = apiEnvSchema.pick({
  NODE_ENV: true,
  DATABASE_URL: true,
  REDIS_URL: true
});

function loadWith<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue: z.ZodIssue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const workerEnvSchema = coreWorkerEnvSchema.extend({
  EMAIL_FROM_ADDRESS: apiEnvSchema.shape.EMAIL_FROM_ADDRESS,
  WEB_APP_URL: apiEnvSchema.shape.WEB_APP_URL
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return loadWith(workerEnvSchema, source);
}

// worker-webhooks: normalizes already-persisted ProviderWebhookEvent payloads.
// No provider credentials needed - all data it needs is already in the payload.
export const webhooksWorkerEnvSchema = coreWorkerEnvSchema;
export type WebhooksWorkerEnv = z.infer<typeof webhooksWorkerEnvSchema>;
export function loadWebhooksWorkerEnv(source: NodeJS.ProcessEnv = process.env): WebhooksWorkerEnv {
  return loadWith(webhooksWorkerEnvSchema, source);
}

// worker-messaging: calls the real provider Send API, so it needs the token
// decryption key and the Graph API version - but not the app secret (sends
// authenticate with the per-account access token, not app-level credentials).
export const messagingWorkerEnvSchema = coreWorkerEnvSchema.extend({
  ENCRYPTION_KEY: apiEnvSchema.shape.ENCRYPTION_KEY,
  META_GRAPH_API_VERSION: apiEnvSchema.shape.META_GRAPH_API_VERSION,
  // Local-dev/manual-testing only: points the Graph API client at a throwaway
  // local stub instead of the real graph.instagram.com, to exercise the real
  // send/error-handling code path without live Meta credentials or a real
  // customer messaging window. Never set in staging/production.
  META_GRAPH_BASE_URL: z.string().url().optional()
});
export type MessagingWorkerEnv = z.infer<typeof messagingWorkerEnvSchema>;
export function loadMessagingWorkerEnv(source: NodeJS.ProcessEnv = process.env): MessagingWorkerEnv {
  return loadWith(messagingWorkerEnvSchema, source);
}

// worker-ai: the only app/worker holding AI provider credentials. apps/api
// never calls Claude/Voyage directly (see docs/architecture/overview.md's
// "never call an external provider/LLM synchronously inside a request" rule).
export const aiWorkerEnvSchema = coreWorkerEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  VOYAGE_API_KEY: z.string().min(1, "VOYAGE_API_KEY is required"),
  // Org-level BusinessProfile.defaultModel overrides this; this is just the
  // fallback so the model is never hardcoded into the provider class itself.
  AI_DEFAULT_MODEL: z.string().default("claude-sonnet-5"),
  AI_EMBEDDING_MODEL: z.string().default("voyage-4")
});
export type AiWorkerEnv = z.infer<typeof aiWorkerEnvSchema>;
export function loadAiWorkerEnv(source: NodeJS.ProcessEnv = process.env): AiWorkerEnv {
  return loadWith(aiWorkerEnvSchema, source);
}

// worker-automations: executes due follow-ups and fires automation triggers.
// No external provider credentials - it only reuses the existing outbound-send
// pipeline (worker-messaging) and internal Prisma-backed CRM tables.
export const automationsWorkerEnvSchema = coreWorkerEnvSchema;
export type AutomationsWorkerEnv = z.infer<typeof automationsWorkerEnvSchema>;
export function loadAutomationsWorkerEnv(source: NodeJS.ProcessEnv = process.env): AutomationsWorkerEnv {
  return loadWith(automationsWorkerEnvSchema, source);
}

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url()
});

export type WebEnv = z.infer<typeof webEnvSchema>;
