import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { StorageClient } from "@yoyo/storage";
import type { AICompletionRequest, AICompletionResult, AIProvider, ImageEditProvider, ImageEditResult } from "@yoyo/ai";
import { createTestConnectedAccount, createTestContentItem, createTestContentMediaAsset, createOrgWithOwner } from "@yoyo/testing";
import { generateCaption, enhanceImage } from "@yoyo/worker-content";
import { buildTestApp, ensureTestBucket, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

class ScriptedAIProvider implements AIProvider {
  constructor(private readonly result: AICompletionResult) {}
  async complete(_request: AICompletionRequest): Promise<AICompletionResult> {
    return this.result;
  }
}

class ScriptedImageEditProvider implements ImageEditProvider {
  constructor(private readonly impl: (image: Buffer, mimeType: string, instruction: string) => Promise<ImageEditResult>) {}
  edit(image: Buffer, mimeType: string, instruction: string): Promise<ImageEditResult> {
    return this.impl(image, mimeType, instruction);
  }
}

function textResult(text: string): AICompletionResult {
  return { stopReason: "end_turn", content: [{ type: "text", text }], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 } };
}

describe("worker-content: caption generation & image enhancement", () => {
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

  async function seedContentItem() {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await createTestConnectedAccount(prisma, { organizationId: organization.id, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    const item = await createTestContentItem(prisma, { organizationId: organization.id, connectedAccountId: account.id, caption: null });
    return { organization, item };
  }

  describe("generateCaption", () => {
    it("writes the AI's caption and moves the item back to DRAFT", async () => {
      const { item } = await seedContentItem();
      const prisma = getPrisma(app);
      const aiProvider = new ScriptedAIProvider(textResult("Warm croissants, fresh out of the oven!"));

      const result = await generateCaption(prisma, aiProvider, "claude-sonnet-5", item.id, "make it cozy");

      expect(result).toBe("generated");
      const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(updated.status).toBe("DRAFT");
      expect(updated.caption).toBe("Warm croissants, fresh out of the oven!");
      expect(updated.captionPrompt).toBe("make it cozy");
    });

    it("marks the item GENERATION_FAILED when the AI returns no text", async () => {
      const { item } = await seedContentItem();
      const prisma = getPrisma(app);
      const aiProvider = new ScriptedAIProvider({ stopReason: "end_turn", content: [], usage: { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });

      const result = await generateCaption(prisma, aiProvider, "claude-sonnet-5", item.id);

      expect(result).toBe("failed");
      const updated = await prisma.contentItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(updated.status).toBe("GENERATION_FAILED");
      expect(updated.generationError).toBeTruthy();
    });

    it("does not regenerate a caption that is already GENERATING", async () => {
      const { item } = await seedContentItem();
      const prisma = getPrisma(app);
      await prisma.contentItem.update({ where: { id: item.id }, data: { status: "GENERATING" } });
      const aiProvider = new ScriptedAIProvider(textResult("Should not be used"));

      const result = await generateCaption(prisma, aiProvider, "claude-sonnet-5", item.id);
      expect(result).toBe("skipped");
    });
  });

  describe("enhanceImage", () => {
    it("uploads the enhanced bytes under a new key and marks the asset ENHANCED", async () => {
      const { organization, item } = await seedContentItem();
      const prisma = getPrisma(app);
      const originalKey = `orgs/${organization.id}/content/original.jpg`;
      await storage.putObject(originalKey, Buffer.from("original bytes"), "image/jpeg");
      const asset = await createTestContentMediaAsset(prisma, { organizationId: organization.id, contentItemId: item.id, storageKey: originalKey });

      const imageEditProvider = new ScriptedImageEditProvider(async () => ({ data: Buffer.from("enhanced bytes"), mimeType: "image/png" }));
      const result = await enhanceImage(prisma, storage, imageEditProvider, asset.id, "make it look like a magazine ad");

      expect(result).toBe("enhanced");
      const updated = await prisma.contentMediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(updated.status).toBe("ENHANCED");
      expect(updated.originalStorageKey).toBe(originalKey);
      expect(updated.storageKey).not.toBe(originalKey);
      expect(updated.mimeType).toBe("image/png");

      const enhancedBytes = await storage.getObject(updated.storageKey);
      expect(enhancedBytes.toString("utf8")).toBe("enhanced bytes");
    });

    it("marks the asset ENHANCEMENT_FAILED when the provider throws", async () => {
      const { organization, item } = await seedContentItem();
      const prisma = getPrisma(app);
      const originalKey = `orgs/${organization.id}/content/original-2.jpg`;
      await storage.putObject(originalKey, Buffer.from("original bytes"), "image/jpeg");
      const asset = await createTestContentMediaAsset(prisma, { organizationId: organization.id, contentItemId: item.id, storageKey: originalKey });

      const imageEditProvider = new ScriptedImageEditProvider(async () => {
        throw new Error("Gemini refused the request");
      });
      const result = await enhanceImage(prisma, storage, imageEditProvider, asset.id, "make it look like a magazine ad");

      expect(result).toBe("failed");
      const updated = await prisma.contentMediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(updated.status).toBe("ENHANCEMENT_FAILED");
      expect(updated.enhancementError).toContain("Gemini refused");
    });
  });
});
