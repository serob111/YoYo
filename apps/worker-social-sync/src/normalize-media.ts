import type { RawSocialMediaItem } from "@yoyo/integrations";

// Plain data shapes (not full Prisma types) so this stays a pure,
// easily-unit-testable mapping function with no live DB/client dependency.

export interface SocialMediaItemUpsertData {
  organizationId: string;
  connectedAccountId: string;
  provider: "INSTAGRAM" | "TIKTOK";
  providerMediaId: string;
  mediaType: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL";
  caption: string | null;
  permalink: string | null;
  postedAt: Date | null;
  thumbnailUrl: string | null;
  primaryMediaUrl: string | null;
  providerMetadata: Record<string, unknown>;
}

export interface SocialMediaAssetUpsertData {
  position: number;
  kind: "IMAGE" | "VIDEO";
  mediaUrl: string;
  thumbnailUrl: string | null;
  providerChildId: string | null;
}

export function toSocialMediaItemUpsertData(
  raw: RawSocialMediaItem,
  organizationId: string,
  connectedAccountId: string,
  provider: "INSTAGRAM" | "TIKTOK"
): SocialMediaItemUpsertData {
  return {
    organizationId,
    connectedAccountId,
    provider,
    providerMediaId: raw.providerMediaId,
    mediaType: raw.mediaType,
    caption: raw.caption,
    permalink: raw.permalink,
    postedAt: raw.postedAt,
    thumbnailUrl: raw.thumbnailUrl,
    primaryMediaUrl: raw.primaryMediaUrl,
    providerMetadata: raw.raw
  };
}

// Carousel children only - a non-carousel item has no assets (its single
// image/video already lives on primaryMediaUrl).
export function toSocialMediaAssetsUpsertData(raw: RawSocialMediaItem): SocialMediaAssetUpsertData[] {
  if (raw.mediaType !== "CAROUSEL") return [];
  return raw.children.map((child, index) => ({
    position: index,
    kind: child.mediaType,
    mediaUrl: child.mediaUrl ?? "",
    thumbnailUrl: child.thumbnailUrl,
    providerChildId: child.providerChildId
  }));
}
