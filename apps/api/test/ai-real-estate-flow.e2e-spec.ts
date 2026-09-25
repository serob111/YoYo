import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createOrgWithOwner, createTestBusinessProfile, createTestConnectedAccount, createTestProperty } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import type { AICompletionRequest, AICompletionResult, AIProvider, EmbeddingProvider, EmbeddingResult } from "@yoyo/ai";
import { generateAiReply } from "@yoyo/worker-ai";
import { buildTestApp, getPrisma, resetTestDatabase } from "./utils/test-app";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);
const DEFAULT_MODEL = "claude-sonnet-5";

class ScriptedAIProvider implements AIProvider {
  public readonly requests: AICompletionRequest[] = [];
  private callIndex = 0;
  constructor(private readonly script: AICompletionResult[]) {}
  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    this.requests.push(request);
    const result = this.script[Math.min(this.callIndex, this.script.length - 1)];
    this.callIndex++;
    if (!result) throw new Error("ScriptedAIProvider ran out of scripted responses");
    return result;
  }
}

class FixedEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly vector: number[]) {}
  async embed(texts: string[]): Promise<EmbeddingResult> {
    return { vectors: texts.map(() => this.vector), totalTokens: texts.length };
  }
}

function makeVector(hotIndex: number, dims = 1024): number[] {
  const vector = new Array(dims).fill(0);
  vector[hotIndex] = 1;
  return vector;
}

/**
 * Proves the Vertical Phase 3 AI tool registry seam: real-estate orgs get
 * searchProperties/CREATE_VIEWING/UPDATE_BUYER_PREFERENCES, non-real-estate
 * orgs never see them, mirroring ai-pipeline.e2e-spec.ts's exact harness.
 */
describe("AI sales pipeline: real estate vertical (apps/worker-ai)", () => {
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

  async function seedRealEstateConversation() {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    await prisma.organization.update({ where: { id: organization.id }, data: { vertical: "real_estate" } });
    await createTestBusinessProfile(prisma, { organizationId: organization.id });

    const connectedAccount = await createTestConnectedAccount(prisma, {
      organizationId: organization.id,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });
    const contact = await prisma.contact.create({ data: { organizationId: organization.id, displayName: "Buyer" } });
    await prisma.contactIdentity.create({
      data: { contactId: contact.id, provider: "INSTAGRAM", connectedAccountId: connectedAccount.id, externalId: "buyer-1" }
    });
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        connectedAccountId: connectedAccount.id,
        contactId: contact.id,
        provider: "INSTAGRAM",
        automationState: "AI_ACTIVE"
      }
    });
    const triggerMessage = await prisma.message.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        connectedAccountId: connectedAccount.id,
        provider: "INSTAGRAM",
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: "TEXT",
        text: "Looking for a 2 bedroom apartment in Kentron, budget $180,000",
        status: "DELIVERED"
      }
    });

    const property = await createTestProperty(prisma, { organizationId: organization.id, title: "Kentron 2BR", propertyType: "APARTMENT" });
    await prisma.property.update({ where: { id: property.id }, data: { status: "ACTIVE", bedrooms: 2, priceCents: 17_500_000, district: "Kentron" } });

    const pipeline = await getOrCreateDefaultPipeline(prisma, organization.id);
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        title: "Wants a 2BR in Kentron"
      }
    });

    return { organization, conversation, triggerMessage, contact, property, lead };
  }

  it("calls searchProperties and schedules a viewing via the CREATE_VIEWING action", async () => {
    const { triggerMessage, lead, property } = await seedRealEstateConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "searchProperties", input: { transactionType: "SALE", bedrooms: 2, districts: ["Kentron"] } }],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      },
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "submit_reply",
            input: {
              reply: "I found a match - want to see it tomorrow?",
              intent: "booking",
              needsHuman: false,
              actions: [{ type: "CREATE_VIEWING", propertyId: property.id, leadId: lead.id, delayMinutes: 1440, notes: "First viewing" }]
            }
          }
        ],
        usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    const result = await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("sent");
    const viewings = await prisma.viewing.findMany({ where: { leadId: lead.id } });
    expect(viewings).toHaveLength(1);
    expect(viewings[0]).toMatchObject({ propertyId: property.id, status: "SCHEDULED", notes: "First viewing" });

    const firstRequestTools = provider.requests[0]?.tools?.map((t) => t.name) ?? [];
    expect(firstRequestTools).toContain("searchProperties");
  });

  it("saves buyer preferences via the UPDATE_BUYER_PREFERENCES action", async () => {
    const { triggerMessage, contact } = await seedRealEstateConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "submit_reply",
            input: {
              reply: "Got it, I'll keep an eye out.",
              intent: "other",
              needsHuman: false,
              actions: [{ type: "UPDATE_BUYER_PREFERENCES", transactionType: "SALE", maxPriceCents: 18_000_000, bedrooms: 2, districts: ["Kentron"] }]
            }
          }
        ],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    const result = await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("sent");
    const preference = await prisma.buyerPreference.findUniqueOrThrow({
      where: { contactId_transactionType: { contactId: contact.id, transactionType: "SALE" } }
    });
    expect(preference).toMatchObject({ maxPriceCents: 18_000_000, bedrooms: 2, districts: ["Kentron"] });
  });

  it("saves country and currency via the UPDATE_BUYER_PREFERENCES action", async () => {
    const { triggerMessage, contact } = await seedRealEstateConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "submit_reply",
            input: {
              reply: "Got it, I'll keep an eye out in Dubai.",
              intent: "other",
              needsHuman: false,
              actions: [{ type: "UPDATE_BUYER_PREFERENCES", transactionType: "RENT", country: "UAE", city: "Dubai", currency: "AED", maxPriceCents: 800_000 }]
            }
          }
        ],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    const result = await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("sent");
    const preference = await prisma.buyerPreference.findUniqueOrThrow({
      where: { contactId_transactionType: { contactId: contact.id, transactionType: "RENT" } }
    });
    expect(preference).toMatchObject({ country: "UAE", city: "Dubai", currency: "AED", maxPriceCents: 800_000 });
  });

  it("filters searchProperties by city and country, not just district", async () => {
    const { organization, triggerMessage } = await seedRealEstateConversation();
    const prisma = getPrisma(app);

    const dubaiProperty = await createTestProperty(prisma, { organizationId: organization.id, title: "Dubai Marina 2BR", propertyType: "APARTMENT" });
    await prisma.property.update({
      where: { id: dubaiProperty.id },
      data: { status: "ACTIVE", bedrooms: 2, priceCents: 17_500_000, country: "UAE", city: "Dubai" }
    });
    // The pre-existing property from seedRealEstateConversation has no country/city set -
    // a working city/country filter must exclude it even though district/bedrooms would match.

    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "searchProperties", input: { transactionType: "SALE", bedrooms: 2, country: "UAE", city: "Dubai" } }
        ],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      },
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t2", name: "submit_reply", input: { reply: "Found a match in Dubai.", intent: "booking", needsHuman: false, actions: [] } }
        ],
        usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    const secondRequestMessages = provider.requests[1]?.messages ?? [];
    const toolResultBlock = secondRequestMessages.flatMap((m) => m.content).find((b) => b.type === "tool_result" && b.toolUseId === "t1");
    const results = JSON.parse((toolResultBlock as { content: string }).content) as { id: string }[];
    expect(results.map((p) => p.id)).toEqual([dubaiProperty.id]);
  });

  it("never returns a SALE property when searching RENT listings at the same price, and vice versa", async () => {
    const { organization, triggerMessage } = await seedRealEstateConversation();
    const prisma = getPrisma(app);

    const rentProperty = await createTestProperty(prisma, { organizationId: organization.id, title: "Kentron 2BR for rent", propertyType: "APARTMENT" });
    await prisma.property.update({
      where: { id: rentProperty.id },
      data: { status: "ACTIVE", transactionType: "RENT", rentBillingPeriod: "MONTH", bedrooms: 2, priceCents: 17_500_000, district: "Kentron" }
    });
    // The pre-existing property from seedRealEstateConversation is SALE, priced identically -
    // this is the exact scenario a transactionType-less filter would conflate.

    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "searchProperties", input: { transactionType: "RENT", bedrooms: 2, districts: ["Kentron"] } }
        ],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      },
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "submit_reply",
            input: { reply: "Found a rental match.", intent: "booking", needsHuman: false, actions: [] }
          }
        ],
        usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    const secondRequestMessages = provider.requests[1]?.messages ?? [];
    const toolResultBlock = secondRequestMessages.flatMap((m) => m.content).find((b) => b.type === "tool_result" && b.toolUseId === "t1");
    expect(toolResultBlock?.type).toBe("tool_result");
    const results = JSON.parse((toolResultBlock as { content: string }).content) as { id: string; transactionType: string }[];
    expect(results.map((p) => p.id)).toContain(rentProperty.id);
    expect(results.every((p) => p.transactionType === "RENT")).toBe(true);
  });

  it("never returns a property priced in a different currency, even if the raw numbers are within budget", async () => {
    const { organization, triggerMessage } = await seedRealEstateConversation();
    const prisma = getPrisma(app);

    const aedProperty = await createTestProperty(prisma, { organizationId: organization.id, title: "Dubai Marina 2BR", propertyType: "APARTMENT" });
    await prisma.property.update({
      where: { id: aedProperty.id },
      data: { status: "ACTIVE", bedrooms: 2, priceCents: 190_000_000, currency: "AED", country: "UAE", city: "Dubai" }
    });
    // Priced in EUR at a numerically similar figure to the AED budget below -
    // a currency-blind comparison would wrongly include this.
    const eurProperty = await createTestProperty(prisma, { organizationId: organization.id, title: "Marbella Villa", propertyType: "HOUSE" });
    await prisma.property.update({
      where: { id: eurProperty.id },
      data: { status: "ACTIVE", bedrooms: 4, priceCents: 185_000_000, currency: "EUR", country: "Spain", city: "Marbella" }
    });

    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "searchProperties", input: { transactionType: "SALE", maxPriceCents: 200_000_000, currency: "AED", country: "UAE", city: "Dubai" } }
        ],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t2", name: "submit_reply", input: { reply: "Found a match in Dubai.", intent: "booking", needsHuman: false, actions: [] } }],
        usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    const secondRequestMessages = provider.requests[1]?.messages ?? [];
    const toolResultBlock = secondRequestMessages.flatMap((m) => m.content).find((b) => b.type === "tool_result" && b.toolUseId === "t1");
    const results = JSON.parse((toolResultBlock as { content: string }).content) as { id: string; currency: string }[];
    expect(results.map((p) => p.id)).toContain(aedProperty.id);
    expect(results.map((p) => p.id)).not.toContain(eurProperty.id);
    expect(results.every((p) => p.currency === "AED")).toBe(true);
  });

  it("never advertises real-estate tools or actions to a core-vertical organization's agent", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    // Explicitly core (default) - confirms the seam doesn't leak.
    await createTestBusinessProfile(prisma, { organizationId: organization.id });
    const connectedAccount = await createTestConnectedAccount(prisma, {
      organizationId: organization.id,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });
    const contact = await prisma.contact.create({ data: { organizationId: organization.id, displayName: "Customer" } });
    await prisma.contactIdentity.create({
      data: { contactId: contact.id, provider: "INSTAGRAM", connectedAccountId: connectedAccount.id, externalId: "cust-1" }
    });
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        connectedAccountId: connectedAccount.id,
        contactId: contact.id,
        provider: "INSTAGRAM",
        automationState: "AI_ACTIVE"
      }
    });
    const triggerMessage = await prisma.message.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        connectedAccountId: connectedAccount.id,
        provider: "INSTAGRAM",
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: "TEXT",
        text: "Are you open today?",
        status: "DELIVERED"
      }
    });

    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "submit_reply", input: { reply: "Yes!", intent: "question", needsHuman: false, actions: [] } }],
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
      }
    ]);

    await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    const tools = provider.requests[0]?.tools ?? [];
    expect(tools.map((t) => t.name)).not.toContain("searchProperties");
    const submitReplyTool = tools.find((t) => t.name === "submit_reply");
    const { actions } = submitReplyTool?.inputSchema.properties as { actions: { items: { oneOf: { properties: { type: { const: string } } }[] } } };
    const actionTypes = actions.items.oneOf.map((variant) => variant.properties.type.const);
    expect(actionTypes).not.toContain("CREATE_VIEWING");
    expect(actionTypes).not.toContain("UPDATE_BUYER_PREFERENCES");
  });
});
