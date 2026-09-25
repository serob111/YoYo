import type { ProviderCapabilities } from "../types";

/**
 * TikTok's PublishingProvider is the only interface implemented this phase -
 * no SocialConnectionProvider messaging sibling (TikTok inbound/outbound DM
 * is out of scope, see docs/architecture/mvp-scope.md's Phase 6 section).
 *
 * Note: unaudited TikTok apps are forced to private-only post visibility
 * regardless of granted scopes - a real, permanent platform restriction, not
 * reflected as a ProviderCapabilities flag (there's no boolean for "can
 * publish but only privately"). Surfaced instead via
 * ConnectedAccount.providerMetadata.visibilityRestricted, set at connect time.
 */
export function resolveTikTokCapabilities(scopes: string[], _accountType: string | null): ProviderCapabilities {
  const has = (scope: string) => scopes.includes(scope);
  const canPublish = has("video.publish");

  return {
    oauth: true,
    inboundMessaging: false,
    outboundMessaging: false,
    mediaMessaging: false,
    comments: false,
    photoPublishing: canPublish,
    videoPublishing: canPublish,
    carouselPublishing: canPublish,
    reelsPublishing: false,
    storyPublishing: false,
    draftUpload: false,
    analytics: false,
    webhooks: false,
    // No TikTok API surface for reading an account's own existing videos is
    // available to this app today - architecture (SocialMediaReaderProvider)
    // is provider-agnostic and ready for this, but there is no
    // TikTokMediaReaderProvider implementation, unlike Instagram.
    mediaRead: false
  };
}
