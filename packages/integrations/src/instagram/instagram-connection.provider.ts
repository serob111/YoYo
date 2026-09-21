import type { SocialConnectionProvider, TokenSet, ProviderProfile, ConnectedAccountRef } from "../types";
import { resolveInstagramCapabilities } from "./capabilities";
import { DEFAULT_CONFIG, graphRequest, type InstagramHttpConfig } from "./http";

// Least-privilege: messaging (Phase 2) + content publishing (Phase 6).
// Comments scope is added if/when a phase needs it.
export const INSTAGRAM_OAUTH_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_content_publish"];

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
  // Observed as a string[] from the real Instagram Business Login token
  // exchange endpoint, despite being commonly documented/assumed as a
  // comma-separated string (as Facebook Login's older equivalent returns it)
  // - accept either shape rather than trusting one.
  permissions?: string | string[];
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface MeResponse {
  user_id?: string;
  id?: string;
  username?: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
}

export class InstagramConnectionProvider implements SocialConnectionProvider {
  private readonly config: Required<InstagramHttpConfig>;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    config: InstagramHttpConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: INSTAGRAM_OAUTH_SCOPES.join(","),
      state
    });
    return `${this.config.authorizeBaseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<TokenSet> {
    const form = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    });

    const shortLived = await graphRequest<ShortLivedTokenResponse>(`${this.config.oauthBaseUrl}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const exchangeParams = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: this.appSecret,
      access_token: shortLived.access_token
    });
    const longLived = await graphRequest<LongLivedTokenResponse>(`${this.config.graphBaseUrl}/access_token?${exchangeParams.toString()}`);

    return {
      accessToken: longLived.access_token,
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
      scopes: Array.isArray(shortLived.permissions) ? shortLived.permissions : (shortLived.permissions ?? "").split(",").filter(Boolean)
    };
  }

  async refreshAccessToken(accessToken: string): Promise<TokenSet> {
    const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken });
    const refreshed = await graphRequest<LongLivedTokenResponse>(`${this.config.graphBaseUrl}/refresh_access_token?${params.toString()}`);
    return {
      accessToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      scopes: []
    };
  }

  async getAccountProfile(accessToken: string): Promise<ProviderProfile> {
    const params = new URLSearchParams({
      fields: "user_id,username,name,account_type,profile_picture_url",
      access_token: accessToken
    });
    const me = await graphRequest<MeResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/me?${params.toString()}`);
    return {
      externalAccountId: me.user_id ?? me.id ?? "",
      username: me.username ?? null,
      displayName: me.name ?? null,
      accountType: me.account_type ?? null,
      avatarUrl: me.profile_picture_url ?? null
    };
  }

  getCapabilities(scopes: string[], accountType: string | null) {
    return resolveInstagramCapabilities(scopes, accountType);
  }

  async revokeAccess(account: ConnectedAccountRef): Promise<void> {
    // Best-effort: Meta does not document a dedicated Instagram-Login revoke
    // endpoint distinct from the classic Graph permissions edge. Disconnecting
    // in our own system (ConnectedAccount.status = DISCONNECTED) is what
    // actually matters for tenant safety; this is a courtesy call only.
    const params = new URLSearchParams({ access_token: account.accessToken });
    try {
      await graphRequest(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/permissions?${params.toString()}`, {
        method: "DELETE"
      });
    } catch {
      // Non-fatal: token may already be invalid, which is fine since we're revoking anyway.
    }
  }
}
