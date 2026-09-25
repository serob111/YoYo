import { describe, expect, it } from "vitest";
import type { RawSocialMediaItem } from "@yoyo/integrations";
import { toSocialMediaAssetsUpsertData, toSocialMediaItemUpsertData } from "../normalize-media";

function rawItem(overrides: Partial<RawSocialMediaItem> = {}): RawSocialMediaItem {
  return {
    providerMediaId: "ig_001",
    mediaType: "IMAGE",
    caption: "A caption",
    permalink: "https://instagram.com/p/ig_001/",
    postedAt: new Date("2026-01-01T00:00:00Z"),
    thumbnailUrl: "https://cdn.example/thumb.jpg",
    primaryMediaUrl: "https://cdn.example/media.jpg",
    children: [],
    raw: { id: "ig_001" },
    ...overrides
  };
}

describe("toSocialMediaItemUpsertData", () => {
  it("maps a raw media item to the upsert shape, preserving provider/org/account scoping", () => {
    const result = toSocialMediaItemUpsertData(rawItem(), "org-1", "acct-1", "INSTAGRAM");
    expect(result).toMatchObject({
      organizationId: "org-1",
      connectedAccountId: "acct-1",
      provider: "INSTAGRAM",
      providerMediaId: "ig_001",
      mediaType: "IMAGE",
      caption: "A caption"
    });
  });
});

describe("toSocialMediaAssetsUpsertData", () => {
  it("returns no assets for a non-carousel item", () => {
    expect(toSocialMediaAssetsUpsertData(rawItem({ mediaType: "REEL" }))).toEqual([]);
  });

  it("maps carousel children into positioned assets", () => {
    const item = rawItem({
      mediaType: "CAROUSEL",
      children: [
        { providerChildId: "c1", mediaType: "IMAGE", mediaUrl: "https://cdn.example/c1.jpg", thumbnailUrl: null },
        { providerChildId: "c2", mediaType: "VIDEO", mediaUrl: "https://cdn.example/c2.mp4", thumbnailUrl: "https://cdn.example/c2-thumb.jpg" }
      ]
    });
    const assets = toSocialMediaAssetsUpsertData(item);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({ position: 0, kind: "IMAGE", mediaUrl: "https://cdn.example/c1.jpg", providerChildId: "c1" });
    expect(assets[1]).toMatchObject({ position: 1, kind: "VIDEO", mediaUrl: "https://cdn.example/c2.mp4", providerChildId: "c2" });
  });
});
