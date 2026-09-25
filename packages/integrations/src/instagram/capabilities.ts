import type { ProviderCapabilities } from "../types";

/**
 * Resolved dynamically from granted scopes + account type, never assumed from
 * "it's Instagram" alone - a Personal account or one that denied the messaging
 * scope genuinely cannot message, and the product must reflect that.
 */
export function resolveInstagramCapabilities(scopes: string[], accountType: string | null): ProviderCapabilities {
  const has = (scope: string) => scopes.includes(scope);
  const isBusinessOrCreator = accountType === "BUSINESS" || accountType === "MEDIA_CREATOR";

  const inboundMessaging = isBusinessOrCreator && has("instagram_business_manage_messages");
  const outboundMessaging = inboundMessaging;

  return {
    oauth: true,
    inboundMessaging,
    outboundMessaging,
    mediaMessaging: outboundMessaging,
    comments: isBusinessOrCreator && has("instagram_business_manage_comments"),
    photoPublishing: isBusinessOrCreator && has("instagram_business_content_publish"),
    videoPublishing: isBusinessOrCreator && has("instagram_business_content_publish"),
    carouselPublishing: isBusinessOrCreator && has("instagram_business_content_publish"),
    reelsPublishing: isBusinessOrCreator && has("instagram_business_content_publish"),
    storyPublishing: isBusinessOrCreator && has("instagram_business_content_publish"),
    draftUpload: false,
    analytics: isBusinessOrCreator && has("instagram_business_basic"),
    webhooks: inboundMessaging,
    // Same scope as analytics: instagram_business_basic covers GET /me/media
    // on the Instagram API with Instagram Login product - see
    // InstagramMediaReaderProvider's doc comment for the source.
    mediaRead: isBusinessOrCreator && has("instagram_business_basic")
  };
}
