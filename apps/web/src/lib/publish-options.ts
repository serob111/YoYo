import type { ConnectedAccount, ContentPostType } from "@yoyo/contracts";

type Provider = ConnectedAccount["provider"];
type ProviderCapabilities = ConnectedAccount["capabilities"];

export interface PostTypeOption {
  value: ContentPostType;
  label: string;
  minMedia: number;
  maxMedia: number;
}

// "Reel" is purely a UI label, not a stored value - every non-carousel
// Instagram video publishes through the Reels endpoint today
// (instagram-publishing.provider.ts unconditionally sets media_type=REELS),
// so postType=VIDEO on Instagram already IS a Reel. TikTok has no such
// distinction, so its video option is labeled plainly.
export function getPostTypeOptions(provider: Provider, capabilities: ProviderCapabilities): PostTypeOption[] {
  const options: PostTypeOption[] = [];
  if (capabilities.photoPublishing) options.push({ value: "IMAGE", label: "Photo", minMedia: 1, maxMedia: 1 });
  if (capabilities.videoPublishing) {
    options.push({
      value: "VIDEO",
      label: provider === "INSTAGRAM" && capabilities.reelsPublishing ? "Reel" : "Video",
      minMedia: 1,
      maxMedia: 1
    });
  }
  if (capabilities.carouselPublishing) options.push({ value: "CAROUSEL", label: "Carousel", minMedia: 2, maxMedia: 10 });
  return options;
}
