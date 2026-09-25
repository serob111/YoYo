import type { ConnectedAccountRef, RawSocialMediaChild, RawSocialMediaItem, RawSocialMediaType, SocialMediaPage, SocialMediaReaderProvider } from "../types";
import { DEFAULT_CONFIG, graphRequest, type InstagramHttpConfig } from "./http";

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}";
const PAGE_LIMIT = 25;

interface MediaChildNode {
  id: string;
  media_type: "IMAGE" | "VIDEO";
  media_url?: string;
  thumbnail_url?: string;
}

interface MediaNode {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  children?: { data: MediaChildNode[] };
}

interface MediaListResponse {
  data: MediaNode[];
  paging?: { cursors?: { after?: string }; next?: string };
}

// media_type on its own can't distinguish a Reel from a regular feed video -
// both come back as VIDEO. media_product_type is what actually carries that
// (REELS vs FEED), per the Instagram API with Instagram Login media fields.
function toRawMediaType(node: MediaNode): RawSocialMediaType {
  if (node.media_type === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (node.media_type === "VIDEO") return node.media_product_type === "REELS" ? "REEL" : "VIDEO";
  return "IMAGE";
}

function toRawItem(node: MediaNode): RawSocialMediaItem {
  const children: RawSocialMediaChild[] = (node.children?.data ?? []).map((child) => ({
    providerChildId: child.id,
    mediaType: child.media_type,
    mediaUrl: child.media_url ?? null,
    thumbnailUrl: child.thumbnail_url ?? null
  }));

  return {
    providerMediaId: node.id,
    mediaType: toRawMediaType(node),
    caption: node.caption ?? null,
    permalink: node.permalink ?? null,
    postedAt: node.timestamp ? new Date(node.timestamp) : null,
    thumbnailUrl: node.thumbnail_url ?? null,
    primaryMediaUrl: node.media_url ?? null,
    children,
    raw: node as unknown as Record<string, unknown>
  };
}

/**
 * Requires the instagram_business_basic scope (already requested for every
 * connection - see INSTAGRAM_OAUTH_SCOPES) - that scope covers GET /me and
 * GET /me/media on the Instagram API with Instagram Login product this app
 * uses. No additional OAuth scope needed for read access; Advanced Access to
 * instagram_business_basic itself (beyond the app's own test users) requires
 * Meta App Review with Business verification - see the final delivery report.
 */
export class InstagramMediaReaderProvider implements SocialMediaReaderProvider {
  private readonly config: Required<InstagramHttpConfig>;

  constructor(config: InstagramHttpConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async listMedia(account: ConnectedAccountRef, cursor?: string): Promise<SocialMediaPage> {
    const params = new URLSearchParams({ fields: MEDIA_FIELDS, limit: String(PAGE_LIMIT), access_token: account.accessToken });
    if (cursor) params.set("after", cursor);

    const result = await graphRequest<MediaListResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/me/media?${params.toString()}`);

    return {
      items: result.data.map(toRawItem),
      nextCursor: result.paging?.cursors?.after ?? null
    };
  }

  async getMediaDetails(account: ConnectedAccountRef, mediaId: string): Promise<RawSocialMediaItem> {
    const params = new URLSearchParams({ fields: MEDIA_FIELDS, access_token: account.accessToken });
    const node = await graphRequest<MediaNode>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${mediaId}?${params.toString()}`);
    return toRawItem(node);
  }
}
