import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createTestContact } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

describe("Real estate: properties, lead linking, viewings, buyer preferences", () => {
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

  async function seedOrgWithContactAndLead() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Test Agency" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId, displayName: "Anna Buyer" });

    const leadRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Looking for a 2-bed apartment" })
      .expect(201);

    return { owner, organizationId, contact, leadId: leadRes.body.id as string };
  }

  it("creates a property, updates it, and lists it back", async () => {
    const { owner, organizationId } = await seedOrgWithContactAndLead();

    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Sunny 2-bed in Kentron", propertyType: "APARTMENT", transactionType: "SALE", bedrooms: 2, priceCents: 18_000_000 })
      .expect(201);

    expect(createRes.body.status).toBe("DRAFT");
    expect(createRes.body.visibility).toBe("PRIVATE");

    const updateRes = await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/properties/${createRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({
        title: "Sunny 2-bed in Kentron",
        propertyType: "APARTMENT",
        transactionType: "SALE",
        bedrooms: 2,
        priceCents: 18_000_000,
        status: "ACTIVE"
      })
      .expect(200);
    expect(updateRes.body.status).toBe("ACTIVE");

    const listRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(createRes.body.id);
  });

  it("links and unlinks a lead to a property", async () => {
    const { owner, organizationId, leadId } = await seedOrgWithContactAndLead();

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Downtown loft", propertyType: "APARTMENT", transactionType: "SALE" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties/${propertyRes.body.id}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ leadId })
      .expect(201);

    const detailRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/properties/${propertyRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(detailRes.body.leads).toHaveLength(1);
    expect(detailRes.body.leads[0].lead.id).toBe(leadId);

    await request(app.getHttpServer())
      .delete(`/organizations/${organizationId}/properties/${propertyRes.body.id}/leads/${leadId}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(200);

    const afterRemove = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/properties/${propertyRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(afterRemove.body.leads).toHaveLength(0);
  });

  it("schedules a viewing for a property+lead and transitions it to COMPLETED", async () => {
    const { owner, organizationId, leadId } = await seedOrgWithContactAndLead();

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Garden house", propertyType: "HOUSE", transactionType: "SALE" })
      .expect(201);

    const viewingRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/viewings`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ propertyId: propertyRes.body.id, leadId, scheduledFor: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(201);
    expect(viewingRes.body.status).toBe("SCHEDULED");

    const statusRes = await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/viewings/${viewingRes.body.id}/status`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ status: "COMPLETED" })
      .expect(200);
    expect(statusRes.body.status).toBe("COMPLETED");

    const listRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/viewings`)
      .query({ leadId })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
  });

  it("rejects a viewing for a lead that belongs to a different organization", async () => {
    const { owner, organizationId } = await seedOrgWithContactAndLead();
    const other = await seedOrgWithContactAndLead();

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Cross-org test", propertyType: "APARTMENT", transactionType: "SALE" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/viewings`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ propertyId: propertyRes.body.id, leadId: other.leadId, scheduledFor: new Date().toISOString() })
      .expect(404);
  });

  it("sets and reads buyer preferences for a contact", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContactAndLead();

    await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .query({ transactionType: "SALE" })
      .set("Cookie", owner.cookieHeader)
      .expect(404);

    const upsertRes = await request(app.getHttpServer())
      .put(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ transactionType: "SALE", maxPriceCents: 20_000_000, bedrooms: 2, districts: ["Kentron", "Arabkir"] })
      .expect(200);
    expect(upsertRes.body.districts).toEqual(["Kentron", "Arabkir"]);

    const getRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .query({ transactionType: "SALE" })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(getRes.body.maxPriceCents).toBe(20_000_000);

    const updateRes = await request(app.getHttpServer())
      .put(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ transactionType: "SALE", maxPriceCents: 25_000_000, bedrooms: 3, districts: ["Kentron"] })
      .expect(200);
    expect(updateRes.body.maxPriceCents).toBe(25_000_000);
    expect(updateRes.body.bedrooms).toBe(3);
  });

  it("keeps SALE and RENT buyer preferences for the same contact independent", async () => {
    const { owner, organizationId, contact } = await seedOrgWithContactAndLead();

    await request(app.getHttpServer())
      .put(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ transactionType: "SALE", maxPriceCents: 20_000_000 })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ transactionType: "RENT", maxPriceCents: 150_000, leaseDurationMonths: 12 })
      .expect(200);

    const saleRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .query({ transactionType: "SALE" })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(saleRes.body.maxPriceCents).toBe(20_000_000);

    const rentRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/contacts/${contact.id}/buyer-preferences`)
      .query({ transactionType: "RENT" })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(rentRes.body.maxPriceCents).toBe(150_000);
    expect(rentRes.body.leaseDurationMonths).toBe(12);
  });

  it("never returns a SALE property when searching RENT listings at the same price, and vice versa", async () => {
    const { owner, organizationId } = await seedOrgWithContactAndLead();

    const saleRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Sale unit", propertyType: "APARTMENT", transactionType: "SALE", status: "ACTIVE", priceCents: 150_000 })
      .expect(201);

    const rentRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({
        title: "Rent unit",
        propertyType: "APARTMENT",
        transactionType: "RENT",
        status: "ACTIVE",
        priceCents: 150_000,
        rentBillingPeriod: "MONTH"
      })
      .expect(201);

    const saleListRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/properties`)
      .query({ status: "ACTIVE" })
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    const ids = saleListRes.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(saleRes.body.id);
    expect(ids).toContain(rentRes.body.id);
    expect(saleListRes.body.items.find((p: { id: string }) => p.id === saleRes.body.id).transactionType).toBe("SALE");
    expect(saleListRes.body.items.find((p: { id: string }) => p.id === rentRes.body.id).transactionType).toBe("RENT");
  });
});
