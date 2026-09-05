import { ProviderApiError, type ProviderFailureCategory } from "../types";

// Meta Graph API error subcodes/codes worth special-casing. Not exhaustive -
// unrecognized codes fall back to a status-code-based classification.
const TOKEN_INVALID_CODES = new Set([190]); // OAuthException: token expired/revoked/invalid
const PERMISSION_CODES = new Set([200, 10]); // permission/scope revoked or insufficient
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

export function classifyGraphApiError(httpStatus: number, body: GraphErrorBody | undefined): ProviderApiError {
  const code = body?.error?.code;
  const message = body?.error?.message ?? `Instagram Graph API request failed with status ${httpStatus}`;

  let category: ProviderFailureCategory;
  if (code !== undefined && TOKEN_INVALID_CODES.has(code)) {
    category = "ACTION_REQUIRED";
  } else if (code !== undefined && PERMISSION_CODES.has(code)) {
    category = "ACTION_REQUIRED";
  } else if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    category = "RETRYABLE";
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
  // A timeout after the request may have reached Meta means we don't know if it
  // sent - never blindly resend a customer-facing message on this path.
  const category: ProviderFailureCategory = /timeout|ETIMEDOUT|ECONNRESET/i.test(message) ? "REQUIRES_RECONCILIATION" : "RETRYABLE";
  return new ProviderApiError(`Network error calling Instagram Graph API: ${message}`, category);
}
