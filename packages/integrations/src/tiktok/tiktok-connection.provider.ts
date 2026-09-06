import type { SocialConnectionProvider, TokenSet, ProviderProfile, ConnectedAccountRef } from "../types";
import { resolveTikTokCapabilities } from "./capabilities";
import { DEFAULT_CONFIG, tiktokRequest, type TikTokHttpConfig } from "./http";

// Only video.publish is needed for the PublishingProvider this phase - no
// messaging scope, since TikTok DM isn't implemented (see capabilities.ts).
export const TIKTOK_OAUTH_SCOPES = ["user.info.basic", "video.publish"];

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
  open_id: string;
}

interface UserInfoResponse {
  user: {
    open_id: string;
    union_id?: string;
    display_name?: string;
    avatar_url?: string;
  };
}

export class TikTokConnectionProvider implements SocialConnectionProvider {
  private readonly config: Required<TikTokHttpConfig>;

  constructor(
    private readonly clientKey: string,
    private readonly clientSecret: string,
    config: TikTokHttpConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // NOTE: TikTok's Login Kit v2 documents PKCE (code_challenge/code_verifier)
  // as part of the authorization flow. This interface's shape (state,
  // redirectUri only) doesn't thread a verifier through - added as a known
  // follow-up when wiring a real TikTok app, not silently assumed unnecessary.
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: TIKTOK_OAUTH_SCOPES.join(","),
      state
    });
    return `${this.config.authorizeBaseUrl}/${this.config.apiVersion}/auth/authorize/?${params.toString()}`;
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<TokenSet> {
    const form = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });
    const result = await tiktokRequest<TokenResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    return {
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
      scopes: (result.scope ?? "").split(",").filter(Boolean)
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const form = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
    const result = await tiktokRequest<TokenResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    return {
      accessToken: result.access_token,
      expiresAt: new Date(Date.now() + result.expires_in * 1000),
      scopes: (result.scope ?? "").split(",").filter(Boolean)
    };
  }

  async getAccountProfile(accessToken: string): Promise<ProviderProfile> {
    const params = new URLSearchParams({ fields: "open_id,union_id,display_name,avatar_url" });
    const result = await tiktokRequest<UserInfoResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/user/info/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return {
      externalAccountId: result.user.open_id,
      username: null,
      displayName: result.user.display_name ?? null,
      accountType: null,
      avatarUrl: result.user.avatar_url ?? null
    };
  }

  getCapabilities(scopes: string[], accountType: string | null) {
    return resolveTikTokCapabilities(scopes, accountType);
  }

  async revokeAccess(account: ConnectedAccountRef): Promise<void> {
    const form = new URLSearchParams({ client_key: this.clientKey, client_secret: this.clientSecret, token: account.accessToken });
    try {
      await tiktokRequest(`${this.config.apiBaseUrl}/${this.config.apiVersion}/oauth/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      });
    } catch {
      // Non-fatal: token may already be invalid, which is fine since we're revoking anyway.
    }
  }
}
