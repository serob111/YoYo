import type { Provider as ProviderName } from "@yoyo/database";
import { InstagramPublishingProvider, TikTokPublishingProvider, type PublishingProvider } from "@yoyo/integrations";

export interface PublishingProviderFactoryConfig {
  metaGraphApiVersion: string;
  metaGraphBaseUrl?: string;
  tiktokApiBaseUrl?: string;
}

/**
 * Plain function, no DI - worker apps aren't Nest apps. Mirrors how
 * apps/worker-messaging/src/index.ts constructs its provider directly from env.
 */
export function createPublishingProvider(provider: ProviderName, config: PublishingProviderFactoryConfig): PublishingProvider {
  switch (provider) {
    case "INSTAGRAM":
      return new InstagramPublishingProvider({ graphApiVersion: config.metaGraphApiVersion, graphBaseUrl: config.metaGraphBaseUrl });
    case "TIKTOK":
      return new TikTokPublishingProvider({ apiBaseUrl: config.tiktokApiBaseUrl });
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`No PublishingProvider for provider: ${exhaustiveCheck}`);
    }
  }
}
