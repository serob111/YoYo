import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getPrisma } from "./utils/test-app";
import { buildTestApp, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

/**
 * Extends tenant-isolation.e2e-spec.ts's coverage to the Phase 3 resources:
 * business profile, products, services, knowledge chunks. Same requirement -
 * a user in Organization A must never read or act on Organization B's data,
 * even with a known valid UUID.
 */
describe("Tenant isolation: AI sales resources", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let productBId: string;
  let serviceBId: string;
  let knowledgeChunkBId: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);

    ownerA = await signupUser(app);
    const ownerB = await signupUser(app);

    const orgA = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ name: "Org A" })
      .expect(201);
    organizationAId = orgA.body.id;

    const orgB = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ name: "Org B" })
      .expect(201);
    organizationBId = orgB.body.id;

    await request(app.getHttpServer())
      .put(`/organizations/${organizationBId}/business-profile`)
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ businessName: "Org B Bakery", timezone: "UTC" })
      .expect(200);

    const productRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationBId}/products`)
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ name: "Org B Cake", currency: "USD" })
      .expect(201);
    productBId = productRes.body.id;

    const serviceRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationBId}/services`)
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ name: "Org B Catering", currency: "USD" })
      .expect(201);
    serviceBId = serviceRes.body.id;

    const knowledgeRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationBId}/knowledge`)
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ content: "Org B is open 9-5." })
      .expect(201);
    knowledgeChunkBId = knowledgeRes.body.id;
  });

  it("blocks reading another organization's business profile", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/business-profile`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks listing another organization's products", async () => {
    const res = await request(app.getHttpServer()).get(`/organizations/${organizationBId}/products`).set("Cookie", ownerA.cookieHeader).expect(403);
    expect(res.body).not.toBeInstanceOf(Array);
  });

  it("blocks updating another organization's product even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/products/${productBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ name: "Hijacked", currency: "USD" })
      .expect(404);
  });

  it("blocks listing another organization's services", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/services`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks deleting another organization's service even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/services/${serviceBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });

  it("blocks listing another organization's knowledge chunks", async () => {
    const res = await request(app.getHttpServer()).get(`/organizations/${organizationBId}/knowledge`).set("Cookie", ownerA.cookieHeader).expect(403);
    expect(res.body).not.toHaveProperty("items");
  });

  it("blocks deleting another organization's knowledge chunk even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/knowledge/${knowledgeChunkBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });

  it("does not leak organization B's data into organization A's own empty lists", async () => {
    const prisma = getPrisma(app);
    const productsA = await request(app.getHttpServer()).get(`/organizations/${organizationAId}/products`).set("Cookie", ownerA.cookieHeader).expect(200);
    expect(productsA.body).toEqual([]);

    const allProducts = await prisma.product.findMany({});
    expect(allProducts).toHaveLength(1);
    expect(allProducts[0]?.organizationId).toBe(organizationBId);
  });
});
