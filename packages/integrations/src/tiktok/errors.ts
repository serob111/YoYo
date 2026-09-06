import { ProviderApiError, type ProviderFailureCategory } from "../types";

// TikTok Content Posting / OAuth error codes worth special-casing. Not
// exhaustive - unrecognized codes fall back to a status-code-based
// classification. Verify against TikTok's current docs if a new code shows
// up in practice; this is a first pass, not gospel (see docs/adr/0007).
const TOKEN_INVALID_CODES = new Set(["access_token_invalid", "scope_not_authorized"]);
const RATE_LIMIT_CODES = new Set(["rate_limit_exceeded"]);
const NON_RETRYABLE_CODES = new Set(["spam_risk_too_many_posts", "spam_risk_user_banned_from_posting", "video_pull_failed", "invalid_params"]);

export interface TikTokErrorBody {
  error?: { code?: string; message?: string; log_id?: string };
}

export function classifyTikTokApiError(httpStatus: number, body: TikTokErrorBody | undefined): ProviderApiError {
  const code = body?.error?.code;
  const message = body?.error?.message ?? `TikTok API request failed with status ${httpStatus}`;

  let category: ProviderFailureCategory;
  if (code && TOKEN_INVALID_CODES.has(code)) {
    category = "ACTION_REQUIRED";
  } else if (code && RATE_LIMIT_CODES.has(code)) {
    category = "RETRYABLE";
  } else if (code && NON_RETRYABLE_CODES.has(code)) {
    category = "NON_RETRYABLE";
  } else if (httpStatus === 401 || httpStatus === 403) {
    category = "ACTION_REQUIRED";
  } else if (httpStatus === 429 || httpStatus >= 500) {
    category = "RETRYABLE";
  } else if (httpStatus >= 400) {
    category = "NON_RETRYABLE";
  } else {
    category = "RETRYABLE";
  }

  return new ProviderApiError(message, category, httpStatus, code);
}

/** For network-level failures (timeout, DNS, connection reset) where the outcome is ambiguous. */
export function classifyNetworkError(error: unknown): ProviderApiError {
  const message = error instanceof Error ? error.message : String(error);
  const category: ProviderFailureCategory = /timeout|ETIMEDOUT|ECONNRESET/i.test(message) ? "REQUIRES_RECONCILIATION" : "RETRYABLE";
  return new ProviderApiError(`Network error calling TikTok API: ${message}`, category);
}
