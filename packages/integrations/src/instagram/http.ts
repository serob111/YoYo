import { classifyGraphApiError, classifyNetworkError, type GraphErrorBody } from "./errors";

export interface InstagramHttpConfig {
  graphApiVersion?: string;
  /** Overridable for tests / local smoke tests against a stub server. */
  graphBaseUrl?: string;
  oauthBaseUrl?: string;
  authorizeBaseUrl?: string;
}

export const DEFAULT_CONFIG: Required<InstagramHttpConfig> = {
  graphApiVersion: "v23.0",
  graphBaseUrl: "https://graph.instagram.com",
  oauthBaseUrl: "https://api.instagram.com",
  authorizeBaseUrl: "https://www.instagram.com"
};

export async function graphRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw classifyNetworkError(error);
  }

  const text = await response.text();
  const body = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    throw classifyGraphApiError(response.status, body);
  }

  return body as T;
}

function safeJsonParse(text: string): GraphErrorBody {
  try {
    return JSON.parse(text) as GraphErrorBody;
  } catch {
    return { error: { message: text } };
  }
}
