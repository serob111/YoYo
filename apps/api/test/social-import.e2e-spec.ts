import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createOrgWithOwner, createTestConnectedAccount } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "@yoyo/ai";
import type { RawSocialMediaItem, SocialMediaReaderProvider, SocialMediaPage, ConnectedAccountRef } from "@yoyo/integrations";
import { processSocialSync } from "@yoyo/worker-social-sync";
import { SocialImportService } from "../src/social-import/social-import.service";
import { buildTestApp, getPrisma, resetTestDatabase } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);
const AI_MODEL = "claude-sonnet-5";

function rawItem(id: string, mediaType: RawSocialMediaItem["mediaType"], caption: string): RawSocialMediaItem {
  return {
    providerMediaId: id,
    mediaType,
    caption,
    permalink: `https://instagram.com/p/${id}/`,
    postedAt: new Date("2026-01-15T00:00:00Z"),
    thumbnailUrl: `https://cdn.example/${id}.jpg`,
    primaryMediaUrl: `https://cdn.example/${id}.jpg`,
    children: [],
    raw: { id }
  };
}

class FixedMediaReaderProvider implements SocialMediaReaderProvider {
  constructor(private readonly items: RawSocialMediaItem[]) {}
  async listMedia(_account: ConnectedAccountRef, cursor?: string): Promise<SocialMediaPage> {
    if (cursor) return { items: [], nextCursor: null };
    return { items: this.items, nextCursor: null };
  }
  async getMediaDetails(_account: ConnectedAccountRef, mediaId: string): Promise<RawSocialMediaItem> {
    const found = this.items.find((i) => i.providerMediaId === mediaId);
    if (!found) throw new Error("not found");
    return found;
  }
}

// Scripted by caption content rather than call order - processSocialSync only
// calls the AI for items it hasn't analyzed yet, so on a second sync the call
// count/order differs from the first; keying off the caption keeps the
// extraction script correct regardless of how many times a given item is analyzed.
class CaptionScriptedAIProvider implements AIProvider {
  constructor(private readonly script: Record<string, Record<string, unknown>>) {}
  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const userText = (request.messages[0]!.content[0] as { text: string }).text;
    const match = Object.keys(this.script).find((caption) => userText.includes(caption));
    const input = match ? this.script[match]! : { isPropertyRelated: false, confidence: 0.1 };
    return {
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "submit_listing_extraction", input }],
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
    };
  }
}

const DUBAI_MARINA_1 = "Stunning 3BR apartment in Dubai Marina, AED 1,850,000";
const DUBAI_MARINA_2 = "More photos of the Dubai Marina 3BR, AED 1,850,000";
const DUBAI_MARINA_3 = "Walkthrough of the Dubai Marina 3 bedroom, AED 1,850,000";
const NON_PROPERTY = "Happy New Year from the team!";

const DUBAI_MARINA_EXTRACTION = {
  isPropertyRelated: true,
  confidence: 0.9,
  transactionType: "SALE",
  propertyType: "APARTMENT",
  title: "Dubai Marina Apartment",
  description: "3 bedroom apartment in Dubai Marina",
  price: 1850000,
  currency: "AED",
  bedrooms: 3,
  bathrooms: null,
  areaSqm: null,
  country: null,
  city: "Dubai",
  district: "Dubai Marina",
  address: null,
  externalListingReference: null,
  availabilityHint: null,
  signals: ["AED 1,850,000"]
};

describe("Social import (Instagram existing-inventory)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
  });

  /** For tests that only need DB state (no HTTP session), the raw fixture is enough. */
  async function seedOrgWithInstagramAccount() {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    await prisma.organization.update({ where: { id: organization.id }, data: { vertical: "real_estate" } });
    const connectedAccount = await createTestConnectedAccount(prisma, { organizationId: organization.id, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    return { organization, connectedAccount };
  }

  /** For tests that also need a real authenticated session (HTTP-level assertions). */
  async function seedOrgWithInstagramAccountAndSession() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Global Homes", vertical: "real_estate" })
      .expect(201);
    const organizationId: string = orgRes.body.id;
    const prisma = getPrisma(app);
    const connectedAccount = await createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    return { owner, organizationId, connectedAccount };
  }

  it("tenant-isolates SocialMediaItem/candidate/sync reads across organizations", async () => {
    const prisma = getPrisma(app);
    const { organizationId: orgAId, connectedAccount: accountA } = await seedOrgWithInstagramAccountAndSession();
    const { owner: ownerB } = await seedOrgWithInstagramAccountAndSession();

    const syncA = await prisma.socialSync.create({ data: { organizationId: orgAId, connectedAccountId: accountA.id, status: "COMPLETED" } });

    await request(app.getHttpServer()).get(`/organizations/${orgAId}/social-syncs/${syncA.id}`).set("Cookie", ownerB.cookieHeader).expect(403);
    await request(app.getHttpServer()).get(`/organizations/${orgAId}/property-import-candidates`).set("Cookie", ownerB.cookieHeader).expect(403);
  });

  it("starting a sync via the API creates a QUEUED SocialSync row and a matching social_sync.requested outbox event", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithInstagramAccountAndSession();

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/social-syncs`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id })
      .expect(201);

    expect(res.body).toMatchObject({ organizationId, connectedAccountId: connectedAccount.id, status: "QUEUED", type: "INITIAL" });

    const prisma = getPrisma(app);
    const outboxEvent = await prisma.outboxEvent.findFirst({ where: { aggregateType: "SocialSync", aggregateId: res.body.id } });
    expect(outboxEvent).toMatchObject({ eventType: "social_sync.requested", status: "PENDING" });
  });

  it("processSocialSync: idempotent re-sync never duplicates SocialMediaItem/SocialMediaAsset rows", async () => {
    const { organization, connectedAccount } = await seedOrgWithInstagramAccount();
    const prisma = getPrisma(app);
    const mediaReader = new FixedMediaReaderProvider([rawItem("ig_1", "IMAGE", DUBAI_MARINA_1)]);
    const aiProvider = new CaptionScriptedAIProvider({ [DUBAI_MARINA_1]: DUBAI_MARINA_EXTRACTION });
    const deps = { prisma, tokenEncryption, mediaReaders: { INSTAGRAM: mediaReader }, aiProvider, aiModel: AI_MODEL };

    const sync1 = await prisma.socialSync.create({ data: { organizationId: organization.id, connectedAccountId: connectedAccount.id } });
    await processSocialSync(deps, sync1.id);

    const sync2 = await prisma.socialSync.create({ data: { organizationId: organization.id, connectedAccountId: connectedAccount.id } });
    await processSocialSync(deps, sync2.id);

    const items = await prisma.socialMediaItem.findMany({ where: { connectedAccountId: connectedAccount.id } });
    expect(items).toHaveLength(1);
  });

  it("groups multiple posts about the same listing into one PropertyImportCandidate, excluding non-property content", async () => {
    const { organization, connectedAccount } = await seedOrgWithInstagramAccount();
    const prisma = getPrisma(app);
    const mediaReader = new FixedMediaReaderProvider([
      rawItem("ig_1", "REEL", DUBAI_MARINA_1),
      rawItem("ig_2", "CAROUSEL", DUBAI_MARINA_2),
      rawItem("ig_3", "REEL", DUBAI_MARINA_3),
      rawItem("ig_4", "IMAGE", NON_PROPERTY)
    ]);
    const aiProvider = new CaptionScriptedAIProvider({
      [DUBAI_MARINA_1]: DUBAI_MARINA_EXTRACTION,
      [DUBAI_MARINA_2]: DUBAI_MARINA_EXTRACTION,
      [DUBAI_MARINA_3]: DUBAI_MARINA_EXTRACTION
    });

    const sync = await prisma.socialSync.create({ data: { organizationId: organization.id, connectedAccountId: connectedAccount.id } });
    await processSocialSync({ prisma, tokenEncryption, mediaReaders: { INSTAGRAM: mediaReader }, aiProvider, aiModel: AI_MODEL }, sync.id);

    const candidates = await prisma.propertyImportCandidate.findMany({ where: { organizationId: organization.id }, include: { items: true } });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.items).toHaveLength(3);
    expect(candidates[0]!.title).toBe("Dubai Marina Apartment");

    const nonPropertyItem = await prisma.socialMediaItem.findFirstOrThrow({ where: { providerMediaId: "ig_4" } });
    expect(nonPropertyItem.isPropertyRelated).toBe(false);
    expect(nonPropertyItem.candidateId).toBeNull();
  });

  describe("review actions (import/link/ignore)", () => {
    async function seedReadyCandidate() {
      const { organization, connectedAccount } = await seedOrgWithInstagramAccount();
      const prisma = getPrisma(app);
      const mediaReader = new FixedMediaReaderProvider([rawItem("ig_1", "REEL", DUBAI_MARINA_1), rawItem("ig_2", "CAROUSEL", DUBAI_MARINA_2)]);
      const aiProvider = new CaptionScriptedAIProvider({ [DUBAI_MARINA_1]: DUBAI_MARINA_EXTRACTION, [DUBAI_MARINA_2]: DUBAI_MARINA_EXTRACTION });
      const sync = await prisma.socialSync.create({ data: { organizationId: organization.id, connectedAccountId: connectedAccount.id } });
      await processSocialSync({ prisma, tokenEncryption, mediaReaders: { INSTAGRAM: mediaReader }, aiProvider, aiModel: AI_MODEL }, sync.id);
      const candidate = await prisma.propertyImportCandidate.findFirstOrThrow({ where: { organizationId: organization.id } });
      return { organization, connectedAccount, candidate, mediaReader, aiProvider };
    }

    it("importing a candidate creates exactly one Property, defaulting to DRAFT (never auto-ACTIVE)", async () => {
      const { organization, candidate } = await seedReadyCandidate();
      const prisma = getPrisma(app);
      const service = app.get(SocialImportService);

      const propertiesBefore = await prisma.property.count({ where: { organizationId: organization.id } });
      expect(propertiesBefore).toBe(0);

      const property = await service.importCandidate(organization.id, candidate.id, "test-user", { status: "DRAFT" });
      expect(property.status).toBe("DRAFT");

      const propertiesAfter = await prisma.property.count({ where: { organizationId: organization.id } });
      expect(propertiesAfter).toBe(1);

      const media = await prisma.propertyMedia.findMany({ where: { propertyId: property.id } });
      expect(media.length).toBeGreaterThan(0);

      const updatedCandidate = await prisma.propertyImportCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(updatedCandidate.status).toBe("IMPORTED");
      expect(updatedCandidate.importedPropertyId).toBe(property.id);

      // Re-importing an already-imported candidate must be rejected, not silently re-run.
      await expect(service.importCandidate(organization.id, candidate.id, "test-user", { status: "DRAFT" })).rejects.toThrow();

      // And PropertyMedia must not have been duplicated by that rejected attempt.
      const mediaAfterSecondAttempt = await prisma.propertyMedia.findMany({ where: { propertyId: property.id } });
      expect(mediaAfterSecondAttempt).toHaveLength(media.length);
    });

    it("importing with an explicit ACTIVE status is allowed (human override), but DRAFT stays the default", async () => {
      const { organization, candidate } = await seedReadyCandidate();
      const service = app.get(SocialImportService);
      const property = await service.importCandidate(organization.id, candidate.id, "test-user", { status: "ACTIVE" });
      expect(property.status).toBe("ACTIVE");
    });

    it("linking a candidate to an existing property attaches media without creating a new Property", async () => {
      const { organization, candidate } = await seedReadyCandidate();
      const prisma = getPrisma(app);
      const existingProperty = await prisma.property.create({ data: { organizationId: organization.id, title: "Manually added", propertyType: "APARTMENT" } });
      const service = app.get(SocialImportService);

      await service.linkCandidate(organization.id, candidate.id, "test-user", { propertyId: existingProperty.id });

      const propertyCount = await prisma.property.count({ where: { organizationId: organization.id } });
      expect(propertyCount).toBe(1);
      const media = await prisma.propertyMedia.findMany({ where: { propertyId: existingProperty.id } });
      expect(media.length).toBeGreaterThan(0);
      const updatedCandidate = await prisma.propertyImportCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
      expect(updatedCandidate.status).toBe("LINKED_EXISTING");
    });

    it("an ignored candidate's items stay excluded from grouping after a re-sync", async () => {
      const { organization, connectedAccount, candidate, mediaReader, aiProvider } = await seedReadyCandidate();
      const prisma = getPrisma(app);
      const service = app.get(SocialImportService);

      await service.ignoreCandidate(organization.id, candidate.id, "test-user");

      const sync2 = await prisma.socialSync.create({ data: { organizationId: organization.id, connectedAccountId: connectedAccount.id } });
      await processSocialSync({ prisma, tokenEncryption, mediaReaders: { INSTAGRAM: mediaReader }, aiProvider, aiModel: AI_MODEL }, sync2.id);

      const candidatesAfterResync = await prisma.propertyImportCandidate.findMany({ where: { organizationId: organization.id } });
      expect(candidatesAfterResync).toHaveLength(1);
      expect(candidatesAfterResync[0]!.status).toBe("IGNORED");

      const items = await prisma.socialMediaItem.findMany({ where: { connectedAccountId: connectedAccount.id } });
      expect(items.every((i) => i.importStatus === "IGNORED")).toBe(true);
    });
  });
});
