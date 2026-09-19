import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createOrgWithOwner, createTestContact } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";
import { parseSetCookies, cookieHeader } from "./utils/cookies";
import { findLastEmailToken, closeEmailQueueInspector } from "./utils/email-queue-inspector";

describe("CRM: leads, pipeline, tags, tasks", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await closeEmailQueueInspector();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedOrgWithContact() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Test Bakery" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId, displayName: "Jane Customer" });
    return { owner, organizationId, contact };
  }

  it("auto-creates the default pipeline with 7 ordered stages on first read", async () => {
    const { owner, organizationId } = await seedOrgWithContact();

    const res = await request(app.getHttpServer()).get(`/organizations/${organizationId}/pipeline`).set("Cookie", owner.cookieHeader).expect(200);

    expect(res.body.name).toBe("Default Pipeline");
    expect(res.body.stages).toHaveLength(7);
    expect(res.body.stages.map((s: { name: string }) => s.name)).toEqual([
      "New",
      "Contacted",
      "AI Qualifying",
      "Qualified",
      "Nurture",
      "Won",
      "Lost"
    ]);
    expect(res.body.stages.find((s: { name: string }) => s.name === "Won").isWon).toBe(true);
    expect(res.body.stages.find((s: { name: string }) => s.name === "Lost").isLost).toBe(true);
  });

  it("creates a lead in the first pipeline stage, moves it to Won, and logs activities", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContact();

    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Wants a wedding cake", currency: "USD" })
      .expect(201);

    expect(createRes.body.closedAt).toBeNull();
    const pipelineRes = await request(app.getHttpServer()).get(`/organizations/${organizationId}/pipeline`).set("Cookie", owner.cookieHeader).expect(200);
    const newStage = pipelineRes.body.stages.find((s: { name: string }) => s.name === "New");
    expect(createRes.body.stageId).toBe(newStage.id);

    const wonStage = pipelineRes.body.stages.find((s: { name: string }) => s.name === "Won");
    const moveRes = await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/leads/${createRes.body.id}/stage`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ stageId: wonStage.id })
      .expect(200);

    expect(moveRes.body.stageId).toBe(wonStage.id);
    expect(moveRes.body.closedAt).not.toBeNull();

    const detailRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads/${createRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(detailRes.body.activities).toHaveLength(1);
    expect(detailRes.body.activities[0]).toMatchObject({ type: "STAGE_CHANGE" });
  });

  it("sets a lead's intent on create, updates it, and filters the list by intent", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContact();

    const buyerRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Wants to buy", intent: "BUYER" })
      .expect(201);
    expect(buyerRes.body.intent).toBe("BUYER");

    const sellerRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Wants to sell" })
      .expect(201);
    expect(sellerRes.body.intent).toBeNull();

    const updateRes = await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/leads/${sellerRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Wants to sell", currency: "USD", intent: "SELLER" })
      .expect(200);
    expect(updateRes.body.intent).toBe("SELLER");

    const filteredRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads?intent=BUYER`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(filteredRes.body.items.map((l: { id: string }) => l.id)).toEqual([buyerRes.body.id]);
  });

  it("attaches and detaches an existing tag on a lead", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContact();

    const tagRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/tags`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "VIP" })
      .expect(201);

    const leadRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Repeat customer" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads/${leadRes.body.id}/tags`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ tagId: tagRes.body.id })
      .expect(201);

    const detailRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads/${leadRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(detailRes.body.tags).toHaveLength(1);
    expect(detailRes.body.tags[0].tag.name).toBe("VIP");

    await request(app.getHttpServer())
      .delete(`/organizations/${organizationId}/leads/${leadRes.body.id}/tags/${tagRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(200);

    const afterRemove = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads/${leadRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(afterRemove.body.tags).toHaveLength(0);
  });

  it("completing a task logs a TASK_COMPLETED activity on its lead", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContact();

    const leadRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "New inquiry" })
      .expect(201);

    const taskRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/tasks`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ leadId: leadRes.body.id, title: "Call back tomorrow" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/tasks/${taskRes.body.id}/status`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ status: "DONE" })
      .expect(200);

    const detailRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads/${leadRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(detailRes.body.activities.some((a: { type: string }) => a.type === "TASK_COMPLETED")).toBe(true);
  });

  it("manually creates a contact with just a name, and a second with phone/email", async () => {
    const { owner, organizationId } = await seedOrgWithContact();

    const minimalRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/contacts`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ displayName: "Walk-in referral" })
      .expect(201);
    expect(minimalRes.body).toMatchObject({ displayName: "Walk-in referral", phone: null, email: null });

    const fullRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/contacts`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ displayName: "Phone lead", phone: "+15551234567", email: "phone-lead@example.com" })
      .expect(201);
    expect(fullRes.body).toMatchObject({ displayName: "Phone lead", phone: "+15551234567", email: "phone-lead@example.com" });

    const listRes = await request(app.getHttpServer()).get(`/organizations/${organizationId}/contacts`).set("Cookie", owner.cookieHeader).expect(200);
    expect(listRes.body.items.map((c: { displayName: string }) => c.displayName)).toEqual(
      expect.arrayContaining(["Walk-in referral", "Phone lead"])
    );
  });

  it("rejects manual contact creation without manageCRM capability", async () => {
    const { owner, organizationId } = await seedOrgWithContact();

    const viewerEmail = "viewer@example.com";
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/members/invite`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ email: viewerEmail, role: "VIEWER" })
      .expect(201);

    const inviteToken = await findLastEmailToken(viewerEmail, "ORGANIZATION_INVITE");
    const acceptRes = await request(app.getHttpServer()).post("/members/accept-invite").send({ token: inviteToken }).expect(201);
    const viewerCookies = parseSetCookies(acceptRes.headers["set-cookie"] as unknown as string[]);
    const viewerCookieHeader = cookieHeader(viewerCookies);
    const viewerCsrfToken = viewerCookies["yoyo_csrf"]!;

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/contacts`)
      .set("Cookie", viewerCookieHeader)
      .set("x-csrf-token", viewerCsrfToken)
      .send({ displayName: "Should be blocked" })
      .expect(403);
  });

  it("two concurrent first-ever getOrCreateDefaultPipeline calls for the same org produce exactly one Pipeline row", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);

    const [a, b] = await Promise.all([
      getOrCreateDefaultPipeline(prisma, organization.id),
      getOrCreateDefaultPipeline(prisma, organization.id)
    ]);

    expect(a.id).toBe(b.id);
    const pipelines = await prisma.pipeline.findMany({ where: { organizationId: organization.id } });
    expect(pipelines).toHaveLength(1);
  });
});
