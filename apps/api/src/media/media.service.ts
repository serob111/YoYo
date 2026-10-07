import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { StorageClient } from "@yoyo/storage";
import type { ApiEnv } from "@yoyo/config";
import type { MediaAssetKind, PropertyMediaKind } from "@yoyo/contracts";
import { API_ENV } from "../common/env.tokens";
import { ProviderNotConfiguredError, TenantAccessDeniedError } from "../common/domain-errors";

@Injectable()
export class MediaService {
  private readonly storage: StorageClient | null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.storage =
      env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? new StorageClient({
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            forcePathStyle: env.S3_FORCE_PATH_STYLE
          })
        : null;
  }

  private client(): StorageClient {
    if (!this.storage) throw new ProviderNotConfiguredError("Object storage");
    return this.storage;
  }

  private extFor(kind: MediaAssetKind | PropertyMediaKind): string {
    return kind === "VIDEO" ? "mp4" : "bin";
  }

  /** Server-generated key, never client-supplied - no tenant-crossing key-guessing surface.
   * scope distinguishes retention semantics: "content" objects can be purged
   * once their ContentItem is no longer published, "properties/:id" objects
   * should live as long as the property does. */
  private buildKey(organizationId: string, ext: string, scope: string): string {
    return `orgs/${organizationId}/${scope}/${randomUUID()}.${ext}`;
  }

  async getPresignedUploadUrl(organizationId: string, contentType: string, kind: MediaAssetKind): Promise<{ key: string; uploadUrl: string }> {
    const key = this.buildKey(organizationId, this.extFor(kind), "content");
    const uploadUrl = await this.client().getPresignedUploadUrl(key, contentType);
    return { key, uploadUrl };
  }

  async getPresignedUploadUrlForProperty(
    organizationId: string,
    propertyId: string,
    contentType: string,
    kind: PropertyMediaKind
  ): Promise<{ key: string; uploadUrl: string }> {
    const key = this.buildKey(organizationId, this.extFor(kind), `properties/${propertyId}`);
    const uploadUrl = await this.client().getPresignedUploadUrl(key, contentType);
    return { key, uploadUrl };
  }

  async getPresignedDownloadUrl(organizationId: string, key: string): Promise<string> {
    this.assertOwnedByOrg(organizationId, key);
    return this.client().getPresignedDownloadUrl(key);
  }

  /** The tenant guard for raw storage keys - there's no DB row to check organizationId against. */
  assertOwnedByOrg(organizationId: string, key: string): void {
    if (!key.startsWith(`orgs/${organizationId}/`)) {
      throw new TenantAccessDeniedError("This media object does not belong to your organization.");
    }
  }

  /** Copies a PropertyMedia's bytes into a fresh content-scoped object so a
   * ContentMediaAsset never shares a storage key with PropertyMedia - a later
   * delete/replace on the property can then never affect an already-scheduled
   * or published post. Falls back to fetch+put when the source has no
   * storageKey (externalUrl-only rows, e.g. un-downloaded Instagram imports). */
  async copyPropertyMediaToContent(
    organizationId: string,
    source: { storageKey: string | null; externalUrl: string | null; kind: PropertyMediaKind; mimeType: string | null }
  ): Promise<{ key: string; mimeType: string }> {
    const ext = this.extFor(source.kind);
    const destKey = this.buildKey(organizationId, ext, "content");
    const fallbackMimeType = source.kind === "VIDEO" ? "video/mp4" : "image/jpeg";

    if (source.storageKey) {
      this.assertOwnedByOrg(organizationId, source.storageKey);
      await this.client().copyObject(source.storageKey, destKey);
      return { key: destKey, mimeType: source.mimeType ?? fallbackMimeType };
    }

    if (!source.externalUrl) {
      throw new ProviderNotConfiguredError("Property media has neither a storage key nor an external URL");
    }
    const response = await fetch(source.externalUrl);
    if (!response.ok) {
      throw new ProviderNotConfiguredError(`Failed to fetch property media from ${source.externalUrl}: ${response.status}`);
    }
    const mimeType = response.headers.get("content-type") ?? fallbackMimeType;
    const bytes = Buffer.from(await response.arrayBuffer());
    await this.client().putObject(destKey, bytes, mimeType);
    return { key: destKey, mimeType };
  }
}
