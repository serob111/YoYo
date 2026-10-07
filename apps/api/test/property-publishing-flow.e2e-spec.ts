import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { StorageClient } from "@yoyo/storage";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "@yoyo/ai";
import type { ConnectedAccountRef, MediaRef, PublishingProvider, PublishResult } from "@yoyo/integrations";
import { createTestConnectedAccount, createTestSocialMediaItem } from "@yoyo/testing";
import { generateCaption } from "@yoyo/worker-content";
import { publishContentItem } from "@yoyo/worker-publishing";
import { buildTestApp, ensureTestBucket, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);
const PUBLISH_CAPABILITIES = { oauth: true, photoPublishing: true, videoPublishing: true, carouselPublishing: true };

class ScriptedAIProvider implements AIProvider {
  constructor(private readonly text: string) {}
  async complete(_request: AICompletionRequest): Promise<AICompletionResult> {
    return { stopReason: "end_turn", content: [{ type: "text", text: this.text }], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 } };
  }
}

class ScriptedPublishingProvider implements PublishingProvider {
  async publishImage(_account: ConnectedAccountRef, _media: MediaRef, _caption: string): Promise<PublishResult> {
    return { externalPostId: "ig-post-from-property" };
  }
  publishVideo = this.publishImage;
  async publishCarousel(_account: ConnectedAccountRef, _media: MediaRef[], _caption: string): Promise<PublishResult> {
    return { externalPostId: "ig-post-from-property" };
  }
}

/**
 * End-to-end "Publish from Property" flow: create a property + media, author
 * a ContentItem linked to it, attach media via the property-media copy
 * endpoint, generate a caption, submit/approve, publish - then confirm the
 * Social tab's two data sources (ContentItem via ?propertyId= vs. the
 * pre-existing social-sources endpoint for SocialMediaItem) are each
 * correct and don't bleed into each other.
 */
describe("Publish from Property: full flow", () => {
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

  it("creates, captions, approves, and publishes a post from a property's media, then surfaces it alongside (not mixed with) imported social sources", async () => {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Publish Flow Agency" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Beachfront Condo", propertyType: "APARTMENT", transactionType: "SALE", priceCents: 50_000_000 })
      .expect(201);
    const propertyId: string = propertyRes.body.id;

    const presignRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties/${propertyId}/media/presigned-upload`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contentType: "image/jpeg", kind: "IMAGE" })
      .expect(201);
    await storage.putObject(presignRes.body.key, Buffer.from("beachfront condo photo"), "image/jpeg");

    const propertyMediaRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties/${propertyId}/media`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ kind: "IMAGE", storageKey: presignRes.body.key, mimeType: "image/jpeg" })
      .expect(201);
    const propertyMediaId: string = propertyMediaRes.body.id;

    const prisma = getPrisma(app);
    const account = await createTestConnectedAccount(prisma, {
      organizationId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token"),
      capabilities: PUBLISH_CAPABILITIES
    });

    const contentItemRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: account.id, postType: "IMAGE", propertyId })
      .expect(201);
    const contentItemId: string = contentItemRes.body.id;
    expect(contentItemRes.body.propertyId).toBe(propertyId);

    const copyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${contentItemId}/media/from-property-media`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ propertyMediaId, order: 0 })
      .expect(201);
    expect(copyRes.body.storageKey).not.toBe(presignRes.body.key);

    const aiProvider = new ScriptedAIProvider("Wake up to ocean views every morning. Beachfront Condo, now for sale.");
    const captionResult = await generateCaption(prisma, aiProvider, "claude-sonnet-5", contentItemId, "seed instruction");
    expect(captionResult).toBe("generated");

    const submitRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${contentItemId}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);
    expect(submitRes.body.status).toBe("PENDING_APPROVAL");

    const approveRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${contentItemId}/approve`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({})
      .expect(201);
    expect(approveRes.body.status).toBe("APPROVED");

    const publishResult = await publishContentItem(prisma, storage, tokenEncryption, () => new ScriptedPublishingProvider(), contentItemId);
    expect(publishResult).toBe("published");

    const listByPropertyRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/content`)
      .query({ propertyId })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(listByPropertyRes.body).toHaveLength(1);
    expect(listByPropertyRes.body[0].id).toBe(contentItemId);
    expect(listByPropertyRes.body[0].status).toBe("PUBLISHED");

    // Seed an original Instagram-imported post for the same property - the
    // Social tab's second data source, which must stay disjoint from the
    // first (ContentItem is YoYo-authored outbound content; SocialMediaItem
    // is content that already existed on the platform before YoYo saw it).
    await createTestSocialMediaItem(prisma, { organizationId, connectedAccountId: account.id, propertyId, caption: "Original IG post" });

    const socialSourcesRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/properties/${propertyId}/social-sources`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(socialSourcesRes.body).toHaveLength(1);
    expect(socialSourcesRes.body[0].caption).toBe("Original IG post");
    expect(socialSourcesRes.body.map((item: { id: string }) => item.id)).not.toContain(contentItemId);
  });
});
