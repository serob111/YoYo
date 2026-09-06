import { ProviderApiError, type ConnectedAccountRef, type MediaRef, type PublishingProvider, type PublishResult } from "../types";
import { DEFAULT_CONFIG, tiktokRequest, type TikTokHttpConfig } from "./http";

interface InitVideoResponse {
  publish_id: string;
  upload_url?: string;
}

interface StatusResponse {
  status: "PROCESSING_DOWNLOAD" | "PROCESSING_UPLOAD" | "PUBLISH_COMPLETE" | "FAILED" | "SEND_TO_USER_INBOX";
  publicly_available_post_id?: string[];
  fail_reason?: string;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s of bounded internal polling per publish call, same budget as Instagram

export class TikTokPublishingProvider implements PublishingProvider {
  private readonly config: Required<TikTokHttpConfig>;

  constructor(config: TikTokHttpConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async publishImage(account: ConnectedAccountRef, media: MediaRef, caption: string): Promise<PublishResult> {
    // TikTok photo posting's exact upload mechanism (FILE_UPLOAD vs
    // PULL_FROM_URL) was flagged as unverified at plan time - PULL_FROM_URL
    // is used here since it's the only mechanism confirmed for PHOTO media,
    // which has the same "needs a publicly reachable URL" limitation as
    // Instagram photos. Verify against current TikTok docs before relying on
    // this in production; a FILE_UPLOAD path for photos may exist and would
    // remove this limitation.
    if (!media.url) {
      throw new ProviderApiError("TikTok photo publishing requires a publicly reachable media URL (PULL_FROM_URL)", "NON_RETRYABLE");
    }
    const publishId = await this.initPhotoPullFromUrl(account, [media.url], caption);
    return this.pollUntilComplete(account, publishId);
  }

  async publishVideo(account: ConnectedAccountRef, media: MediaRef, caption: string): Promise<PublishResult> {
    if (!media.bytes) {
      throw new ProviderApiError("TikTok video publishing requires raw media bytes for FILE_UPLOAD", "NON_RETRYABLE");
    }
    const { publishId, uploadUrl } = await this.initVideoFileUpload(account, media.bytes.length, caption);
    if (!uploadUrl) {
      throw new ProviderApiError("TikTok did not return an upload URL for FILE_UPLOAD", "RETRYABLE");
    }
    await this.uploadVideoBytes(uploadUrl, media.bytes, media.mimeType);
    return this.pollUntilComplete(account, publishId);
  }

  async publishCarousel(account: ConnectedAccountRef, media: MediaRef[], caption: string): Promise<PublishResult> {
    if (media.length < 2 || media.length > 10) {
      throw new ProviderApiError(`TikTok photo carousels require 2-10 media items, got ${media.length}`, "NON_RETRYABLE");
    }
    const urls = media.map((item) => {
      if (!item.url) {
        throw new ProviderApiError("TikTok carousel items require a publicly reachable media URL (PULL_FROM_URL)", "NON_RETRYABLE");
      }
      return item.url;
    });
    const publishId = await this.initPhotoPullFromUrl(account, urls, caption);
    return this.pollUntilComplete(account, publishId);
  }

  private async initVideoFileUpload(account: ConnectedAccountRef, byteLength: number, caption: string): Promise<{ publishId: string; uploadUrl?: string }> {
    const body = {
      post_info: {
        title: caption,
        // Unaudited apps are forced private regardless of this setting - set
        // explicitly rather than relying on the platform default, so intent
        // is documented in the request itself. See capabilities.ts.
        privacy_level: "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: byteLength,
        chunk_size: byteLength,
        total_chunk_count: 1
      },
      post_mode: "DIRECT_POST",
      media_type: "VIDEO"
    };
    const result = await tiktokRequest<InitVideoResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/post/publish/content/init/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { publishId: result.publish_id, uploadUrl: result.upload_url };
  }

  private async initPhotoPullFromUrl(account: ConnectedAccountRef, photoUrls: string[], caption: string): Promise<string> {
    const body = {
      post_info: { title: caption, privacy_level: "SELF_ONLY" },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: photoUrls },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO"
    };
    const result = await tiktokRequest<InitVideoResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/post/publish/content/init/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return result.publish_id;
  }

  private async uploadVideoBytes(uploadUrl: string, bytes: Buffer, mimeType: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`
      },
      body: bytes
    });
    if (!response.ok) {
      throw new ProviderApiError(`TikTok video upload PUT failed with status ${response.status}`, response.status >= 500 ? "RETRYABLE" : "NON_RETRYABLE", response.status);
    }
  }

  private async pollUntilComplete(account: ConnectedAccountRef, publishId: string): Promise<PublishResult> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await tiktokRequest<StatusResponse>(`${this.config.apiBaseUrl}/${this.config.apiVersion}/post/publish/status/fetch/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ publish_id: publishId })
      });
      if (result.status === "PUBLISH_COMPLETE") {
        return { externalPostId: result.publicly_available_post_id?.[0] ?? publishId };
      }
      if (result.status === "FAILED") {
        throw new ProviderApiError(`TikTok publish ${publishId} failed: ${result.fail_reason ?? "unknown reason"}`, "NON_RETRYABLE");
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new ProviderApiError(`TikTok publish ${publishId} still processing after ${POLL_MAX_ATTEMPTS} polls`, "RETRYABLE");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
