import { Controller, Delete, Get, Inject, Logger, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ApiEnv } from "@yoyo/config";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { API_ENV } from "../common/env.tokens";
import { OAuthStateService } from "./oauth-state.service";
import { InstagramProviderFactory } from "./instagram-provider.factory";
import { TikTokProviderFactory } from "./tiktok-provider.factory";
import { ConnectedAccountsService } from "./connected-accounts.service";

@Controller("organizations/:organizationId/integrations/instagram")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class IntegrationsController {
  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly instagramProviderFactory: InstagramProviderFactory
  ) {}

  @Get("authorize")
  @RequireCapability("manageIntegrations")
  authorize(@Param("organizationId") organizationId: string, @CurrentUser() user: CurrentUserPayload, @Res() res: Response) {
    const provider = this.instagramProviderFactory.create();
    const state = this.oauthState.sign({ organizationId, userId: user.id });
    const url = provider.getAuthorizationUrl(state, this.instagramProviderFactory.redirectUri());
    res.redirect(url);
  }
}

@Controller("organizations/:organizationId/integrations/tiktok")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class TikTokIntegrationsController {
  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly tiktokProviderFactory: TikTokProviderFactory
  ) {}

  @Get("authorize")
  @RequireCapability("manageIntegrations")
  authorize(@Param("organizationId") organizationId: string, @CurrentUser() user: CurrentUserPayload, @Res() res: Response) {
    const provider = this.tiktokProviderFactory.create();
    const state = this.oauthState.sign({ organizationId, userId: user.id });
    const url = provider.getAuthorizationUrl(state, this.tiktokProviderFactory.redirectUri());
    res.redirect(url);
  }
}

// TikTok redirects here directly (not org-scoped in the URL - the org comes
// from the signed state), mirroring InstagramOAuthCallbackController.
@Controller("integrations/tiktok")
export class TikTokOAuthCallbackController {
  private readonly logger = new Logger(TikTokOAuthCallbackController.name);

  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly tiktokProviderFactory: TikTokProviderFactory,
    private readonly connectedAccounts: ConnectedAccountsService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  @Get("callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Res() res: Response) {
    const failureRedirect = `${this.env.WEB_APP_URL}/integrations/tiktok/error`;
    if (error || !code || !state) {
      res.redirect(`${failureRedirect}?reason=${encodeURIComponent(error ?? "missing_code")}`);
      return;
    }

    let payload;
    try {
      payload = this.oauthState.verify(state);
    } catch {
      res.redirect(`${failureRedirect}?reason=invalid_state`);
      return;
    }

    try {
      const provider = this.tiktokProviderFactory.create();
      const redirectUri = this.tiktokProviderFactory.redirectUri();
      const tokens = await provider.exchangeAuthorizationCode(code, redirectUri);
      const profile = await provider.getAccountProfile(tokens.accessToken);
      const capabilities = provider.getCapabilities(tokens.scopes, profile.accountType);

      // Unaudited TikTok apps are forced to private-only post visibility - a
      // real, permanent platform restriction, surfaced here rather than as a
      // ProviderCapabilities flag (see packages/integrations/src/tiktok/capabilities.ts).
      const account = await this.connectedAccounts.upsertFromOAuth(payload.organizationId, payload.userId, "TIKTOK", profile, tokens, capabilities, {
        visibilityRestricted: true
      });

      res.redirect(`${this.env.WEB_APP_URL}/dashboard/${payload.organizationId}/settings/integrations?connected=tiktok&accountId=${account.id}`);
    } catch (err) {
      this.logger.error("TikTok OAuth callback failed", err instanceof Error ? err.stack : err);
      res.redirect(`${failureRedirect}?reason=connection_failed`);
    }
  }
}

// Meta redirects here directly (not org-scoped in the URL - the org comes from
// the signed state), so this lives on its own top-level route.
@Controller("integrations/instagram")
export class InstagramOAuthCallbackController {
  private readonly logger = new Logger(InstagramOAuthCallbackController.name);

  constructor(
    private readonly oauthState: OAuthStateService,
    private readonly instagramProviderFactory: InstagramProviderFactory,
    private readonly connectedAccounts: ConnectedAccountsService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  @Get("callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Res() res: Response) {
    const failureRedirect = `${this.env.WEB_APP_URL}/integrations/instagram/error`;
    if (error || !code || !state) {
      res.redirect(`${failureRedirect}?reason=${encodeURIComponent(error ?? "missing_code")}`);
      return;
    }

    let payload;
    try {
      payload = this.oauthState.verify(state);
    } catch {
      res.redirect(`${failureRedirect}?reason=invalid_state`);
      return;
    }

    try {
      const provider = this.instagramProviderFactory.create();
      const redirectUri = this.instagramProviderFactory.redirectUri();
      const tokens = await provider.exchangeAuthorizationCode(code, redirectUri);
      const profile = await provider.getAccountProfile(tokens.accessToken);
      const capabilities = provider.getCapabilities(tokens.scopes, profile.accountType);

      const account = await this.connectedAccounts.upsertFromOAuth(payload.organizationId, payload.userId, "INSTAGRAM", profile, tokens, capabilities);

      res.redirect(`${this.env.WEB_APP_URL}/dashboard/${payload.organizationId}/settings/integrations?connected=instagram&accountId=${account.id}`);
    } catch (err) {
      this.logger.error("Instagram OAuth callback failed", err instanceof Error ? err.stack : err);
      res.redirect(`${failureRedirect}?reason=connection_failed`);
    }
  }
}

@Controller("organizations/:organizationId/integrations")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ConnectedAccountsController {
  constructor(private readonly connectedAccounts: ConnectedAccountsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string) {
    const accounts = await this.connectedAccounts.list(organizationId);
    return accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      status: a.status,
      username: a.username,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      capabilities: a.capabilities,
      lastWebhookAt: a.lastWebhookAt,
      createdAt: a.createdAt
    }));
  }

  @Delete(":connectedAccountId")
  @RequireCapability("manageIntegrations")
  async disconnect(@Param("organizationId") organizationId: string, @Param("connectedAccountId") connectedAccountId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.connectedAccounts.disconnect(organizationId, connectedAccountId, user.id);
  }
}
