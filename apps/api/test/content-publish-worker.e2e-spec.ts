import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { StorageClient } from "@yoyo/storage";
import { ProviderApiError, type ConnectedAccountRef, type MediaRef, type PublishingProvider, type PublishResult } from "@yoyo/integrations";
import { createTestConnectedAccount, createTestContentItem, createTestContentMediaAsset, createOrgWithOwner } from "@yoyo/testing";
import { publishContentItem } from "@yoyo/worker-publishing";
import { buildTestApp, ensureTestBucket, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

class ScriptedPublishingProvider implements PublishingProvider {
  public callCount = 0;
  constructor(private readonly impl: () => Promise<PublishResult>) {}
  async publishImage(_account: ConnectedAccountRef, _media: MediaRef, _caption: string): Promise<PublishResult> {
    this.callCount++;
    return this.impl();
  }
  publishVideo = this.publishImage;
  async publishCarousel(_account: ConnectedAccountRef, _media: MediaRef[], _caption: string): Promise<PublishResult> {
    this.callCount++;
    return this.impl();
  }
}

describe("worker-publishing: publishContentItem", () => {
  let app: INestApplication;
  const storage = new StorageClient({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION!,
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: true
  });

  beforeAll(async () => {
    app = await buildTestApp();
    await ensureTestBucket();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedApprovedItem(overrides: { autoApproved?: boolean } = {}) {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await createTestConnectedAccount(prisma, { organizationId: organization.id, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    const item = await createTestContentItem(prisma, {
      organizationId: organization.id,
      connectedAccountId: account.id,
      status: "APPROVED",
      autoApproved: overrides.autoApproved ?? false
    });
    await createTestContentMediaAsset(prisma, { organizationId: organization.id, contentItemId: item.id });
    return { organization, account, item };
  }

  it("publishes successfully and records the provider's post id", async () => {
    const { item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => ({ externalPostId: "ig-post-123" }));

    const result = await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    expect(result).toBe("published");
    expect(provider.callCount).toBe(1);
    const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.status).toBe("PUBLISHED");
    expect(updated.providerPostId).toBe("ig-post-123");
    expect(updated.publishAttemptCount).toBe(1);
  });

  it("writes a content.auto_published audit row when the item was auto-approved", async () => {
    const { organization, item } = await seedApprovedItem({ autoApproved: true });
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => ({ externalPostId: "ig-post-456" }));

    await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    const auditRow = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: organization.id, action: "content.auto_published" } });
    expect(auditRow.actorId).toBeNull();
    expect(auditRow.entityId).toBe(item.id);
  });

  it("does not double-publish when two calls race on the same content item", async () => {
    const { item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => ({ externalPostId: "ig-post-race" }));

    const [a, b] = await Promise.all([
      publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id),
      publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id)
    ]);

    expect(provider.callCount).toBe(1);
    expect([a, b].sort()).toEqual(["published", "skipped"]);
  });

  it("reverts a RETRYABLE failure to APPROVED and rethrows for BullMQ to retry", async () => {
    const { item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => {
      throw new ProviderApiError("Rate limited", "RETRYABLE", 429);
    });

    await expect(publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id)).rejects.toThrow("Rate limited");
    const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.status).toBe("APPROVED");
  });

  it("marks ACTION_REQUIRED failures PUBLISH_FAILED and flips the connected account", async () => {
    const { account, item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => {
      throw new ProviderApiError("Token expired", "ACTION_REQUIRED", 401, 190);
    });

    const result = await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    expect(result).toBe("failed");
    const updatedItem = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updatedItem.status).toBe("PUBLISH_FAILED");
    const updatedAccount = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updatedAccount.status).toBe("ACTION_REQUIRED");
  });

  it("marks NON_RETRYABLE failures PUBLISH_FAILED without touching the connected account", async () => {
    const { account, item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => {
      throw new ProviderApiError("Invalid carousel size", "NON_RETRYABLE", 400);
    });

    const result = await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    expect(result).toBe("failed");
    const updatedItem = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updatedItem.status).toBe("PUBLISH_FAILED");
    expect(updatedItem.publishErrorMessage).toBe("Invalid carousel size");
    const updatedAccount = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updatedAccount.status).toBe("CONNECTED");
  });

  it("flags REQUIRES_RECONCILIATION failures for manual review", async () => {
    const { item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    const provider = new ScriptedPublishingProvider(async () => {
      throw new ProviderApiError("Timeout - unknown outcome", "REQUIRES_RECONCILIATION");
    });

    const result = await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    expect(result).toBe("failed");
    const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.status).toBe("PUBLISH_FAILED");
    expect(updated.metadata).toMatchObject({ requiresReconciliation: true });
  });

  it("fails fast without calling the provider when the connected account needs reconnecting", async () => {
    const { account, item } = await seedApprovedItem();
    const prisma = getPrisma(app);
    await prisma.connectedAccount.update({ where: { id: account.id }, data: { status: "ACTION_REQUIRED" } });
    const provider = new ScriptedPublishingProvider(async () => ({ externalPostId: "should-not-happen" }));

    const result = await publishContentItem(prisma, storage, tokenEncryption, () => provider, item.id);

    expect(result).toBe("failed");
    expect(provider.callCount).toBe(0);
    const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.status).toBe("PUBLISH_FAILED");
  });
});
