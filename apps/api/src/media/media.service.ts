import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { StorageClient } from "@yoyo/storage";
import type { ApiEnv } from "@yoyo/config";
import type { MediaAssetKind } from "@yoyo/contracts";
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

  /** Server-generated key, never client-supplied - no tenant-crossing key-guessing surface. */
  private buildKey(organizationId: string, kind: MediaAssetKind): string {
    const ext = kind === "VIDEO" ? "mp4" : "bin";
    return `orgs/${organizationId}/content/${randomUUID()}.${ext}`;
  }

  async getPresignedUploadUrl(organizationId: string, contentType: string, kind: MediaAssetKind): Promise<{ key: string; uploadUrl: string }> {
    const key = this.buildKey(organizationId, kind);
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
}
