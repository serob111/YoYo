import { createServer, type Server } from "node:http";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { createTestConnectedAccount, createTestContentItem, createTestProperty, createTestPropertyMedia } from "@yoyo/testing";
import { buildTestApp, ensureTestBucket, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

/**
 * Covers ContentService.addMediaAssetFromPropertyMedia (MediaService.copyPropertyMediaToContent)
 * - the "Publish from Property" flow's media step. A ContentMediaAsset must
 * never share a storage key with the PropertyMedia it was published from, so
 * deleting/replacing the property's photo later can't affect an already-
 * published post.
 */
describe("Publish from Property: media copy", () => {
  let app: INestApplication;
  let owner: AuthedContext;
  let organizationId: string;

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

    owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Copy Test Agency" })
      .expect(201);
    organizationId = orgRes.body.id;
  });

  async function seedContentItem() {
    const prisma = getPrisma(app);
    const account = await createTestConnectedAccount(prisma, {
      organizationId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });
    const contentItem = await createTestContentItem(prisma, { organizationId, connectedAccountId: account.id });
    return contentItem.id;
  }

  it("copies a storageKey-backed property photo into an independent ContentMediaAsset", async () => {
    const prisma = getPrisma(app);
    const property = await createTestProperty(prisma, { organizationId });

    const presignRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties/${property.id}/media/presigned-upload`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contentType: "image/jpeg", kind: "IMAGE" })
      .expect(201);

    const originalBytes = Buffer.from("original property photo bytes");
    await fetch(presignRes.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: originalBytes }).then((r) =>
      expect(r.ok).toBe(true)
    );

    const propertyMedia = await createTestPropertyMedia(prisma, {
      organizationId,
      propertyId: property.id,
      storageKey: presignRes.body.key,
      mimeType: "image/jpeg"
    });

    const contentItemId = await seedContentItem();

    const copyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${contentItemId}/media/from-property-media`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ propertyMediaId: propertyMedia.id, order: 0 })
      .expect(201);

    expect(copyRes.body.storageKey).not.toBe(propertyMedia.storageKey);
    expect(copyRes.body.mimeType).toBe("image/jpeg");
    expect(copyRes.body.kind).toBe("IMAGE");

    // Delete the source PropertyMedia, then confirm the copied ContentMediaAsset
    // object is still independently readable - the whole point of copying.
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationId}/properties/${property.id}/media/${propertyMedia.id}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(200);

    const downloadRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/media/presigned-download`)
      .query({ key: copyRes.body.storageKey })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    const getResponse = await fetch(downloadRes.body.url);
    const downloaded = Buffer.from(await getResponse.arrayBuffer());
    expect(downloaded.toString("utf8")).toBe(originalBytes.toString("utf8"));
  });

  it("falls back to fetch+put for an externalUrl-only property media row (un-downloaded social import)", async () => {
    const externalBytes = Buffer.from("bytes served from a provider-hosted CDN URL");
    let server: Server | undefined;
    const port = await new Promise<number>((resolve) => {
      server = createServer((_req, res) => {
        res.setHeader("content-type", "image/png");
        res.end(externalBytes);
      });
      server!.listen(0, "127.0.0.1", () => resolve((server!.address() as { port: number }).port));
    });

    try {
      const prisma = getPrisma(app);
      const property = await createTestProperty(prisma, { organizationId });
      const propertyMedia = await createTestPropertyMedia(prisma, {
        organizationId,
        propertyId: property.id,
        storageKey: undefined,
        externalUrl: `http://127.0.0.1:${port}/photo.png`
      });

      const contentItemId = await seedContentItem();

      const copyRes = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/content/${contentItemId}/media/from-property-media`)
        .set("Cookie", owner.cookieHeader)
        .set("x-csrf-token", owner.csrfToken)
        .send({ propertyMediaId: propertyMedia.id, order: 0 })
        .expect(201);

      expect(copyRes.body.mimeType).toBe("image/png");

      const downloadRes = await request(app.getHttpServer())
        .get(`/organizations/${organizationId}/media/presigned-download`)
        .query({ key: copyRes.body.storageKey })
        .set("Cookie", owner.cookieHeader)
        .expect(200);
      const getResponse = await fetch(downloadRes.body.url);
    const downloaded = Buffer.from(await getResponse.arrayBuffer());
      expect(downloaded.toString("utf8")).toBe(externalBytes.toString("utf8"));
    } finally {
      await new Promise((resolve) => server?.close(resolve));
    }
  });
});
