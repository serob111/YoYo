// Capability-based provider abstraction. See docs/architecture/provider-abstraction.md.
// Small, capability-scoped interfaces - a provider adapter implements only what it
// actually supports; nothing here assumes every provider can do everything.

export interface ProviderCapabilities {
  oauth: boolean;
  inboundMessaging: boolean;
  outboundMessaging: boolean;
  mediaMessaging: boolean;
  comments: boolean;
  photoPublishing: boolean;
  videoPublishing: boolean;
  carouselPublishing: boolean;
  reelsPublishing: boolean;
  storyPublishing: boolean;
  draftUpload: boolean;
  analytics: boolean;
  webhooks: boolean;
}

export interface TokenSet {
  accessToken: string;
  expiresAt: Date | null;
  scopes: string[];
}

export interface ProviderProfile {
  externalAccountId: string;
  username: string | null;
  displayName: string | null;
  accountType: string | null;
  avatarUrl: string | null;
}

export interface ConnectedAccountRef {
  externalAccountId: string;
  accessToken: string;
}

export interface SocialConnectionProvider {
  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeAuthorizationCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshAccessToken(accessToken: string): Promise<TokenSet>;
  getAccountProfile(accessToken: string): Promise<ProviderProfile>;
  getCapabilities(scopes: string[], accountType: string | null): ProviderCapabilities;
  revokeAccess(account: ConnectedAccountRef): Promise<void>;
}

export interface ProviderSendResult {
  providerMessageId: string;
}

export interface MessagingProvider {
  sendText(account: ConnectedAccountRef, recipientExternalId: string, text: string): Promise<ProviderSendResult>;
}

/**
 * Failure taxonomy from docs/architecture/observability.md, used so callers (the
 * messaging worker) know whether to retry, give up, or mark the connection dead.
 */
export type ProviderFailureCategory = "RETRYABLE" | "NON_RETRYABLE" | "REQUIRES_RECONCILIATION" | "ACTION_REQUIRED";

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly category: ProviderFailureCategory,
    public readonly httpStatus?: number,
    public readonly providerErrorCode?: string | number
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}
