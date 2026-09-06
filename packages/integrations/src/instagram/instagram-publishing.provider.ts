import { ProviderApiError, type ConnectedAccountRef, type MediaRef, type PublishingProvider, type PublishResult } from "../types";
import { DEFAULT_CONFIG, graphRequest, type InstagramHttpConfig } from "./http";

interface ContainerResponse {
  id: string;
}

interface ContainerStatusResponse {
  status_code: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";
}

interface PublishingLimitResponse {
  data: Array<{ quota_usage: number; config: { quota_total: number; quota_duration: number } }>;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s of bounded internal polling per publish call

export class InstagramPublishingProvider implements PublishingProvider {
  private readonly config: Required<InstagramHttpConfig>;

  constructor(config: InstagramHttpConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async publishImage(account: ConnectedAccountRef, media: MediaRef, caption: string): Promise<PublishResult> {
    await this.checkPublishingLimit(account);
    if (!media.url) {
      throw new ProviderApiError("Instagram image publishing requires a publicly reachable media URL", "NON_RETRYABLE");
    }
    const containerId = await this.createImageContainer(account, media.url, caption);
    return this.pollAndPublish(account, containerId);
  }

  async publishVideo(account: ConnectedAccountRef, media: MediaRef, caption: string): Promise<PublishResult> {
    await this.checkPublishingLimit(account);
    if (!media.url) {
      throw new ProviderApiError("Instagram video publishing requires a publicly reachable media URL", "NON_RETRYABLE");
    }
    const containerId = await this.createVideoContainer(account, media.url, caption);
    return this.pollAndPublish(account, containerId);
  }

  async publishCarousel(account: ConnectedAccountRef, media: MediaRef[], caption: string): Promise<PublishResult> {
    await this.checkPublishingLimit(account);
    if (media.length < 2 || media.length > 10) {
      throw new ProviderApiError(`Instagram carousels require 2-10 media items, got ${media.length}`, "NON_RETRYABLE");
    }
    const childIds: string[] = [];
    for (const item of media) {
      if (!item.url) {
        throw new ProviderApiError("Instagram carousel items require a publicly reachable media URL", "NON_RETRYABLE");
      }
      const childId = item.kind === "VIDEO" ? await this.createVideoContainer(account, item.url, undefined, true) : await this.createImageContainer(account, item.url, undefined, true);
      childIds.push(childId);
    }
    const containerId = await this.createCarouselContainer(account, childIds, caption);
    return this.pollAndPublish(account, containerId);
  }

  private async pollAndPublish(account: ConnectedAccountRef, containerId: string): Promise<PublishResult> {
    await this.pollContainerStatus(account, containerId);
    const mediaId = await this.publishContainer(account, containerId);
    return { externalPostId: mediaId };
  }

  async createImageContainer(account: ConnectedAccountRef, imageUrl: string, caption?: string, isCarouselItem = false): Promise<string> {
    const params = new URLSearchParams({ image_url: imageUrl, access_token: account.accessToken });
    if (caption) params.set("caption", caption);
    if (isCarouselItem) params.set("is_carousel_item", "true");
    const result = await graphRequest<ContainerResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    return result.id;
  }

  async createVideoContainer(account: ConnectedAccountRef, videoUrl: string, caption?: string, isCarouselItem = false): Promise<string> {
    const params = new URLSearchParams({ video_url: videoUrl, access_token: account.accessToken });
    if (!isCarouselItem) params.set("media_type", "REELS");
    if (caption) params.set("caption", caption);
    if (isCarouselItem) params.set("is_carousel_item", "true");
    const result = await graphRequest<ContainerResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    return result.id;
  }

  async createCarouselContainer(account: ConnectedAccountRef, childContainerIds: string[], caption: string): Promise<string> {
    const params = new URLSearchParams({
      media_type: "CAROUSEL",
      children: childContainerIds.join(","),
      caption,
      access_token: account.accessToken
    });
    const result = await graphRequest<ContainerResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    return result.id;
  }

  async pollContainerStatus(account: ConnectedAccountRef, containerId: string): Promise<void> {
    const params = new URLSearchParams({ fields: "status_code", access_token: account.accessToken });
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const result = await graphRequest<ContainerStatusResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${containerId}?${params.toString()}`);
      if (result.status_code === "FINISHED") return;
      if (result.status_code === "ERROR" || result.status_code === "EXPIRED") {
        throw new ProviderApiError(`Instagram media container ${containerId} failed processing: ${result.status_code}`, "NON_RETRYABLE");
      }
      await sleep(POLL_INTERVAL_MS);
    }
    // Still IN_PROGRESS after bounded polling - treat as retryable so a later
    // BullMQ attempt re-checks rather than failing the post outright.
    throw new ProviderApiError(`Instagram media container ${containerId} still processing after ${POLL_MAX_ATTEMPTS} polls`, "RETRYABLE");
  }

  async publishContainer(account: ConnectedAccountRef, containerId: string): Promise<string> {
    const params = new URLSearchParams({ creation_id: containerId, access_token: account.accessToken });
    const result = await graphRequest<ContainerResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    return result.id;
  }

  async checkPublishingLimit(account: ConnectedAccountRef): Promise<void> {
    const params = new URLSearchParams({ fields: "config,quota_usage", access_token: account.accessToken });
    const result = await graphRequest<PublishingLimitResponse>(`${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/content_publishing_limit?${params.toString()}`);
    const usage = result.data[0];
    if (usage && usage.quota_usage >= usage.config.quota_total) {
      throw new ProviderApiError("Instagram 24h publishing quota exhausted", "RETRYABLE");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
