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
  // Unset in local dev (web/api share plain "localhost", no cross-subdomain
  // concern). Required whenever web and api are deployed on sibling
  // subdomains of a shared parent (e.g. "web.<ip>.sslip.io" /
  // "api.<ip>.sslip.io") - without an explicit Domain, both cookies default
  // to the exact host that set them, so the CSRF cookie (deliberately not
  // HttpOnly, so frontend JS can read it) is invisible to document.cookie on
  // the web origin, and every CSRF-guarded POST/PATCH/DELETE 403s. Set to
  // e.g. ".18-195-193-209.sslip.io" (leading dot optional, RFC 6265 treats
  // it the same either way) to share both cookies across the parent domain.
  COOKIE_DOMAIN: z.string().optional(),

  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanFromString,

  EMAIL_FROM_ADDRESS: z.string().email().default("no-reply@example.com"),
  // Optional, same "app boots without it" pattern as META_*/TIKTOK_*/STRIPE_*
  // below - worker-email falls back to logging emails to its own console
  // when unset, so local dev never needs a real Resend account.
  RESEND_API_KEY: z.string().optional(),

  RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

  RATE_LIMIT_STOREFRONT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_STOREFRONT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

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
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),

  // --- TikTok (Phase 6) ---
  // Same "app boots without these, only the OAuth routes need them" pattern
  // as META_* above - lets local dev proceed before a real TikTok app exists.
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_OAUTH_REDIRECT_URI: z.string().url().optional(),
  // Local-stub override for manual testing, like META_GRAPH_BASE_URL below.
  TIKTOK_API_BASE_URL: z.string().url().optional(),

  // --- Billing (Stripe) ---
  // Optional: the app boots and every other feature works without these. Only
  // the billing checkout/portal/webhook routes require them, and they fail
  // with a clear config error at call time (not at boot) if unset - same
  // "app boots without it" pattern as META_*/TIKTOK_* above, so local dev and
  // the rest of the product work before a real Stripe account exists.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Stripe Price ids for each Plan.key - looked up by key at checkout time
  // rather than stored on the Plan row itself, so pointing at a different
  // Stripe mode/account (test vs live) is an env change, not a migration.
  STRIPE_PRICE_ID_SOLO: z.string().optional(),
  STRIPE_PRICE_ID_TEAM: z.string().optional(),
  STRIPE_PRICE_ID_AGENCY: z.string().optional()
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
  WEB_APP_URL: apiEnvSchema.shape.WEB_APP_URL,
  RESEND_API_KEY: apiEnvSchema.shape.RESEND_API_KEY
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
  AI_EMBEDDING_MODEL: z.string().default("voyage-4"),
  // Load-testing only: when set, worker-ai uses FakeLatencyAIProvider/
  // FakeLatencyEmbeddingProvider (setTimeout-delayed canned responses, zero
  // network calls, zero LLM spend) instead of the real Anthropic/Voyage
  // providers - see packages/ai/src/fake. ANTHROPIC_API_KEY/VOYAGE_API_KEY are
  // still required by this schema but go unused in that mode. Unset (the
  // default) leaves real-provider behavior completely untouched.
  AI_FAKE_LATENCY_MS: z.coerce.number().int().positive().optional()
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

// worker-content: caption generation (Claude, via @yoyo/ai) and optional AI
// image enhancement (Gemini) - the only two apps/workers holding
// GEMINI_API_KEY (same credential-isolation convention as ANTHROPIC_API_KEY
// being worker-ai-only). Needs S3_* to read/write raw image bytes for Gemini.
export const contentWorkerEnvSchema = coreWorkerEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-3-pro-image"),
  AI_DEFAULT_MODEL: z.string().default("claude-sonnet-5"),
  S3_ENDPOINT: apiEnvSchema.shape.S3_ENDPOINT,
  S3_REGION: apiEnvSchema.shape.S3_REGION,
  S3_BUCKET: apiEnvSchema.shape.S3_BUCKET,
  S3_ACCESS_KEY_ID: apiEnvSchema.shape.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: apiEnvSchema.shape.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: apiEnvSchema.shape.S3_FORCE_PATH_STYLE
});
export type ContentWorkerEnv = z.infer<typeof contentWorkerEnvSchema>;
export function loadContentWorkerEnv(source: NodeJS.ProcessEnv = process.env): ContentWorkerEnv {
  return loadWith(contentWorkerEnvSchema, source);
}

// worker-publishing: calls the real Instagram/TikTok publish APIs - needs
// ENCRYPTION_KEY to decrypt ConnectedAccount tokens (same as worker-messaging)
// and S3_* to read media bytes / build presigned download URLs.
export const publishingWorkerEnvSchema = coreWorkerEnvSchema.extend({
  ENCRYPTION_KEY: apiEnvSchema.shape.ENCRYPTION_KEY,
  META_GRAPH_API_VERSION: apiEnvSchema.shape.META_GRAPH_API_VERSION,
  META_GRAPH_BASE_URL: z.string().url().optional(),
  TIKTOK_API_BASE_URL: apiEnvSchema.shape.TIKTOK_API_BASE_URL,
  S3_ENDPOINT: apiEnvSchema.shape.S3_ENDPOINT,
  S3_REGION: apiEnvSchema.shape.S3_REGION,
  S3_BUCKET: apiEnvSchema.shape.S3_BUCKET,
  S3_ACCESS_KEY_ID: apiEnvSchema.shape.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: apiEnvSchema.shape.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: apiEnvSchema.shape.S3_FORCE_PATH_STYLE
});
export type PublishingWorkerEnv = z.infer<typeof publishingWorkerEnvSchema>;
export function loadPublishingWorkerEnv(source: NodeJS.ProcessEnv = process.env): PublishingWorkerEnv {
  return loadWith(publishingWorkerEnvSchema, source);
}

// worker-social-sync: reads existing Instagram media (ENCRYPTION_KEY +
// Graph API version/base-url override, same as worker-messaging) and runs AI
// listing extraction (ANTHROPIC_API_KEY). Deliberately no AI_FAKE_LATENCY_MS
// here - that switch returns a canned sales-agent reply shape, not a
// listing-extraction shape, and extraction correctness is the point of this
// worker; real Anthropic calls on a few dozen short captions cost cents.
export const socialSyncWorkerEnvSchema = coreWorkerEnvSchema.extend({
  ENCRYPTION_KEY: apiEnvSchema.shape.ENCRYPTION_KEY,
  META_GRAPH_API_VERSION: apiEnvSchema.shape.META_GRAPH_API_VERSION,
  META_GRAPH_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  AI_DEFAULT_MODEL: z.string().default("claude-sonnet-5")
});
export type SocialSyncWorkerEnv = z.infer<typeof socialSyncWorkerEnvSchema>;
export function loadSocialSyncWorkerEnv(source: NodeJS.ProcessEnv = process.env): SocialSyncWorkerEnv {
  return loadWith(socialSyncWorkerEnvSchema, source);
}

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url()
});

export type WebEnv = z.infer<typeof webEnvSchema>;
