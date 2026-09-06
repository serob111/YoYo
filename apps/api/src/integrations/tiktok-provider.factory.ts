import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnv } from "@yoyo/config";
import { TikTokConnectionProvider } from "@yoyo/integrations";
import { API_ENV } from "../common/env.tokens";
import { ProviderNotConfiguredError } from "../common/domain-errors";

@Injectable()
export class TikTokProviderFactory {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  create(): TikTokConnectionProvider {
    if (!this.env.TIKTOK_CLIENT_KEY || !this.env.TIKTOK_CLIENT_SECRET) {
      throw new ProviderNotConfiguredError("TikTok");
    }
    return new TikTokConnectionProvider(this.env.TIKTOK_CLIENT_KEY, this.env.TIKTOK_CLIENT_SECRET, {
      apiBaseUrl: this.env.TIKTOK_API_BASE_URL
    });
  }

  redirectUri(): string {
    return this.env.TIKTOK_OAUTH_REDIRECT_URI ?? `${this.env.API_PUBLIC_URL}/integrations/tiktok/callback`;
  }
}
