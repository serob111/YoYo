import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createTestBusinessProfile } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

describe("Public storefront: listing and viewing booking", () => {
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

  async function seedOrgWithStorefrontProperty() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Public Realty Co" })
      .expect(201);
    const organizationId: string = orgRes.body.id;
    const orgSlug: string = orgRes.body.slug;

    const prisma = getPrisma(app);
    await createTestBusinessProfile(prisma, { organizationId });

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({
        title: "Sunny storefront listing",
        propertyType: "APARTMENT",
        transactionType: "SALE",
        status: "ACTIVE",
        visibility: "ORGANIZATION_STOREFRONT",
        priceCents: 15_000_000,
        bedrooms: 2
      })
      .expect(201);

    return { owner, organizationId, orgSlug, propertyId: propertyRes.body.id as string };
  }

  // Computed relative to "now" (not a hardcoded date) so this suite doesn't
  // rot once that date arrives - a weekday at least a week out is safely
  // inside the default fallback viewing hours (Mon-Fri 10:00-19:00 UTC)
  // since this org's BusinessProfile.businessHours is unset.
  function nextWeekdayAtLeastDaysAhead(minDaysAhead: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + minDaysAhead);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d.toISOString().slice(0, 10);
  }
  const BOOKABLE_DATE = nextWeekdayAtLeastDaysAhead(7);

  it("lists only ACTIVE + ORGANIZATION_STOREFRONT properties, never private/draft ones", async () => {
    const { organizationId, orgSlug, owner } = await seedOrgWithStorefrontProperty();

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Private listing", propertyType: "HOUSE", transactionType: "SALE", status: "ACTIVE", visibility: "PRIVATE" })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/storefront/${orgSlug}`).expect(200);
    expect(res.body.organization.name).toBe("Public Realty Co");
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.properties[0].title).toBe("Sunny storefront listing");
    expect(res.body.properties[0].transactionType).toBe("SALE");
  });

  it("returns 404 for an unknown org slug", async () => {
    await request(app.getHttpServer()).get("/storefront/no-such-agency").expect(404);
  });

  it("returns a single storefront property's detail, and 404s for a private one", async () => {
    const { organizationId, orgSlug, propertyId, owner } = await seedOrgWithStorefrontProperty();

    const detailRes = await request(app.getHttpServer()).get(`/storefront/${orgSlug}/properties/${propertyId}`).expect(200);
    expect(detailRes.body).toMatchObject({ id: propertyId, title: "Sunny storefront listing", bedrooms: 2 });

    const privateRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Private listing", propertyType: "HOUSE", transactionType: "SALE", status: "ACTIVE", visibility: "PRIVATE" })
      .expect(201);

    await request(app.getHttpServer()).get(`/storefront/${orgSlug}/properties/${privateRes.body.id}`).expect(404);
  });

  it("returns available viewing slots for a bookable date", async () => {
    const { orgSlug, propertyId } = await seedOrgWithStorefrontProperty();

    const res = await request(app.getHttpServer())
      .get(`/storefront/${orgSlug}/properties/${propertyId}/availability`)
      .query({ date: BOOKABLE_DATE })
      .expect(200);

    expect(res.body.date).toBe(BOOKABLE_DATE);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots).toContain(new Date(`${BOOKABLE_DATE}T10:00:00.000Z`).toISOString());
  });

  it("books a viewing and creates a contact + lead behind it", async () => {
    const { organizationId, orgSlug, propertyId, owner } = await seedOrgWithStorefrontProperty();
    const scheduledFor = new Date(`${BOOKABLE_DATE}T10:00:00.000Z`).toISOString();

    const bookRes = await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "Interested Buyer", phone: "+1 555 0100", email: "buyer@example.com", scheduledFor, notes: "Would love a tour" })
      .expect(201);

    expect(bookRes.body).toMatchObject({ scheduledFor, propertyTitle: "Sunny storefront listing", organizationName: "Public Realty Co" });

    const prisma = getPrisma(app);
    const viewing = await prisma.viewing.findUniqueOrThrow({ where: { id: bookRes.body.viewingId } });
    expect(viewing).toMatchObject({ organizationId, propertyId, status: "SCHEDULED", notes: "Would love a tour" });

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: viewing.leadId } });
    expect(lead.title).toContain("Sunny storefront listing");

    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: lead.contactId } });
    expect(contact).toMatchObject({ displayName: "Interested Buyer", phone: "+1 555 0100", email: "buyer@example.com" });

    const link = await prisma.leadProperty.findUnique({ where: { leadId_propertyId: { leadId: lead.id, propertyId } } });
    expect(link).not.toBeNull();

    // Confirm the lead is visible from the authenticated dashboard side too -
    // the booking feeds the same CRM staff already use, not a side channel.
    const leadListRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(leadListRes.body.items.map((l: { id: string }) => l.id)).toContain(lead.id);
  });

  it("rejects double-booking the same slot", async () => {
    const { orgSlug, propertyId } = await seedOrgWithStorefrontProperty();
    const scheduledFor = new Date(`${BOOKABLE_DATE}T11:00:00.000Z`).toISOString();

    await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "First Buyer", phone: "+1 555 0101", scheduledFor })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "Second Buyer", phone: "+1 555 0102", scheduledFor })
      .expect(409);
  });

  it("rejects a booking outside business hours", async () => {
    const { orgSlug, propertyId } = await seedOrgWithStorefrontProperty();
    const scheduledFor = new Date(`${BOOKABLE_DATE}T03:00:00.000Z`).toISOString(); // 03:00 UTC, before the 10:00 fallback opening

    await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "Night Owl", phone: "+1 555 0103", scheduledFor })
      .expect(409);
  });

  it("returns 404 when booking a property that isn't published to the storefront", async () => {
    const { organizationId, orgSlug, owner } = await seedOrgWithStorefrontProperty();
    const privateRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Private listing", propertyType: "HOUSE", transactionType: "SALE", status: "ACTIVE", visibility: "PRIVATE" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${privateRes.body.id}/book-viewing`)
      .send({ name: "Sneaky", phone: "+1 555 0104", scheduledFor: new Date(`${BOOKABLE_DATE}T10:00:00.000Z`).toISOString() })
      .expect(404);
  });

  it("reuses the existing contact when the same phone books again", async () => {
    const { orgSlug, propertyId } = await seedOrgWithStorefrontProperty();

    const first = await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "Repeat Visitor", phone: "+1 555 0199", scheduledFor: new Date(`${BOOKABLE_DATE}T12:00:00.000Z`).toISOString() })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/storefront/${orgSlug}/properties/${propertyId}/book-viewing`)
      .send({ name: "Repeat Visitor", phone: "+1 555 0199", scheduledFor: new Date(`${BOOKABLE_DATE}T13:00:00.000Z`).toISOString() })
      .expect(201);

    const prisma = getPrisma(app);
    const firstLead = await prisma.lead.findUniqueOrThrow({ where: { id: (await prisma.viewing.findUniqueOrThrow({ where: { id: first.body.viewingId } })).leadId } });
    const secondLead = await prisma.lead.findUniqueOrThrow({ where: { id: (await prisma.viewing.findUniqueOrThrow({ where: { id: second.body.viewingId } })).leadId } });
    expect(firstLead.contactId).toBe(secondLead.contactId);
  });
});
