import { afterEach, describe, expect, it, vi } from "vitest";
import { InstagramMediaReaderProvider } from "../instagram/instagram-media-reader.provider";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const ACCOUNT = { externalAccountId: "17841400000000000", accessToken: "token-123" };

describe("InstagramMediaReaderProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps CAROUSEL_ALBUM to CAROUSEL and normalizes children", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "med_1",
            caption: "Carousel post",
            media_type: "CAROUSEL_ALBUM",
            media_url: "https://cdn/med_1.jpg",
            permalink: "https://instagram.com/p/med_1/",
            timestamp: "2026-01-01T00:00:00+0000",
            children: { data: [{ id: "med_1_c1", media_type: "IMAGE", media_url: "https://cdn/c1.jpg" }] }
          }
        ],
        paging: {}
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new InstagramMediaReaderProvider();
    const page = await provider.listMedia(ACCOUNT);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ providerMediaId: "med_1", mediaType: "CAROUSEL" });
    expect(page.items[0]!.children).toEqual([{ providerChildId: "med_1_c1", mediaType: "IMAGE", mediaUrl: "https://cdn/c1.jpg", thumbnailUrl: null }]);
    expect(page.nextCursor).toBeNull();
  });

  it("distinguishes a Reel (VIDEO + media_product_type REELS) from a regular feed video", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "med_reel", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-01-01T00:00:00+0000" },
          { id: "med_video", media_type: "VIDEO", media_product_type: "FEED", timestamp: "2026-01-01T00:00:00+0000" }
        ],
        paging: { cursors: { after: "cursor-2" } }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new InstagramMediaReaderProvider();
    const page = await provider.listMedia(ACCOUNT);

    expect(page.items.find((i) => i.providerMediaId === "med_reel")?.mediaType).toBe("REEL");
    expect(page.items.find((i) => i.providerMediaId === "med_video")?.mediaType).toBe("VIDEO");
    expect(page.nextCursor).toBe("cursor-2");
  });

  it("passes the after cursor through as a query param on the next page request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], paging: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new InstagramMediaReaderProvider();
    await provider.listMedia(ACCOUNT, "cursor-abc");

    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("after=cursor-abc");
    expect(calledUrl).toContain("/me/media");
  });

  it("getMediaDetails maps a single IMAGE node", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: "med_img", caption: "A photo", media_type: "IMAGE", media_url: "https://cdn/med_img.jpg", timestamp: "2026-01-01T00:00:00+0000" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new InstagramMediaReaderProvider();
    const item = await provider.getMediaDetails(ACCOUNT, "med_img");

    expect(item).toMatchObject({ providerMediaId: "med_img", mediaType: "IMAGE", caption: "A photo" });
  });
});
