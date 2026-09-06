import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { buildTestApp, ensureTestBucket, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

describe("Media: presigned upload/download round trip", () => {
  let app: INestApplication;

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

  it("uploads bytes via a presigned URL and reads them back via a presigned download URL", async () => {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Media Test Org" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const uploadRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/media/presigned-upload`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contentType: "image/jpeg", kind: "IMAGE" })
      .expect(201);
    expect(uploadRes.body.key).toMatch(new RegExp(`^orgs/${organizationId}/content/`));

    const bytes = Buffer.from("fake jpeg bytes for a round-trip test");
    const putResponse = await fetch(uploadRes.body.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: bytes
    });
    expect(putResponse.ok).toBe(true);

    const downloadRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/media/presigned-download`)
      .query({ key: uploadRes.body.key })
      .set("Cookie", owner.cookieHeader)
      .expect(200);

    const getResponse = await fetch(downloadRes.body.url);
    const downloaded = Buffer.from(await getResponse.arrayBuffer());
    expect(downloaded.toString("utf8")).toBe(bytes.toString("utf8"));
  });
});
