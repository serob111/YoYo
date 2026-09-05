import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createOrgWithOwner, createTestContact } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

describe("CRM: leads, pipeline, tags, tasks", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
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

  it("auto-creates the default pipeline with 5 ordered stages on first read", async () => {
    const { owner, organizationId } = await seedOrgWithContact();

    const res = await request(app.getHttpServer()).get(`/organizations/${organizationId}/pipeline`).set("Cookie", owner.cookieHeader).expect(200);

    expect(res.body.name).toBe("Default Pipeline");
    expect(res.body.stages).toHaveLength(5);
    expect(res.body.stages.map((s: { name: string }) => s.name)).toEqual(["New", "Contacted", "Qualified", "Won", "Lost"]);
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
