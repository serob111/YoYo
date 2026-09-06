import { classifyNetworkError, classifyTikTokApiError, type TikTokErrorBody } from "./errors";

export interface TikTokHttpConfig {
  apiVersion?: string;
  /** Overridable for tests / local smoke tests against a stub server. */
  apiBaseUrl?: string;
  authorizeBaseUrl?: string;
}

export const DEFAULT_CONFIG: Required<TikTokHttpConfig> = {
  apiVersion: "v2",
  apiBaseUrl: "https://open.tiktokapis.com",
  authorizeBaseUrl: "https://www.tiktok.com"
};

interface TikTokEnvelope<T> {
  data: T;
  error: { code: string; message: string; log_id?: string };
}

/**
 * Unlike Instagram's Graph API, TikTok returns 200 with an envelope
 * {data, error: {code: "ok" | "<error_code>", ...}} even on failure in some
 * endpoints - both the HTTP status and the envelope's error.code are checked.
 */
export async function tiktokRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw classifyNetworkError(error);
  }

  const text = await response.text();
  const body = text ? safeJsonParse<T>(text) : undefined;

  if (!response.ok) {
    throw classifyTikTokApiError(response.status, body as TikTokErrorBody | undefined);
  }

  const envelope = body as TikTokEnvelope<T> | undefined;
  if (envelope?.error && envelope.error.code !== "ok") {
    throw classifyTikTokApiError(response.status, envelope as unknown as TikTokErrorBody);
  }

  return (envelope?.data ?? (body as T)) as T;
}

function safeJsonParse<T>(text: string): TikTokEnvelope<T> | TikTokErrorBody {
  try {
    return JSON.parse(text) as TikTokEnvelope<T>;
  } catch {
    return { error: { message: text, code: "unknown" } };
  }
}
