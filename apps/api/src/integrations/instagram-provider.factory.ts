import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnv } from "@yoyo/config";
import { InstagramConnectionProvider } from "@yoyo/integrations";
import { API_ENV } from "../common/env.tokens";
import { ProviderNotConfiguredError } from "../common/domain-errors";

@Injectable()
export class InstagramProviderFactory {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  create(): InstagramConnectionProvider {
    if (!this.env.META_APP_ID || !this.env.META_APP_SECRET) {
      throw new ProviderNotConfiguredError("Instagram");
    }
    return new InstagramConnectionProvider(this.env.META_APP_ID, this.env.META_APP_SECRET, {
      graphApiVersion: this.env.META_GRAPH_API_VERSION
    });
  }

  redirectUri(): string {
    return this.env.META_OAUTH_REDIRECT_URI ?? `${this.env.API_PUBLIC_URL}/integrations/instagram/callback`;
  }
}
