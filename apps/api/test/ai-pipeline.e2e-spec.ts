import type { INestApplication } from "@nestjs/common";
import { createOrgWithOwner, createTestBusinessProfile, createTestConnectedAccount } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import type { AICompletionRequest, AICompletionResult, AIProvider, EmbeddingProvider, EmbeddingResult } from "@yoyo/ai";
import { generateAiReply, buildToolHandlers } from "@yoyo/worker-ai";
import { buildTestApp, getPrisma, resetTestDatabase } from "./utils/test-app";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);
const DEFAULT_MODEL = "claude-sonnet-5";

class ScriptedAIProvider implements AIProvider {
  public callCount = 0;
  constructor(private readonly script: AICompletionResult[]) {}
  async complete(_request: AICompletionRequest): Promise<AICompletionResult> {
    this.callCount++;
    const result = this.script[Math.min(this.callCount - 1, this.script.length - 1)];
    if (!result) throw new Error("ScriptedAIProvider ran out of scripted responses");
    return result;
  }
}

class ExplodingAIProvider implements AIProvider {
  async complete(): Promise<AICompletionResult> {
    throw new Error("AIProvider should never be called");
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

async function insertChunkWithVector(prisma: ReturnType<typeof getPrisma>, params: { organizationId: string; content: string; vector: number[] }) {
  const chunk = await prisma.knowledgeChunk.create({
    data: { organizationId: params.organizationId, content: params.content, embeddingStatus: "READY" }
  });
  const vectorLiteral = `[${params.vector.join(",")}]`;
  await prisma.$executeRaw`UPDATE knowledge_chunks SET embedding = ${vectorLiteral}::vector WHERE id = ${chunk.id}`;
  return chunk;
}

const SIMPLE_REPLY_RESULT: AICompletionResult = {
  stopReason: "tool_use",
  content: [
    { type: "tool_use", id: "t1", name: "submit_reply", input: { reply: "We're open 9-5!", intent: "question", needsHuman: false, actions: [] } }
  ],
  usage: { inputTokens: 100_000, outputTokens: 20_000, cacheReadTokens: 0 }
};

describe("AI sales pipeline (apps/worker-ai)", () => {
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

  async function seedAiActiveConversation(overrides: { aiEnabled?: boolean; monthlyCostCapCents?: number | null } = {}) {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    await createTestBusinessProfile(prisma, { organizationId: organization.id, ...overrides });

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
        automationState: overrides.aiEnabled === false ? "HUMAN_ACTIVE" : "AI_ACTIVE"
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

    return { organization, conversation, triggerMessage };
  }

  it("skips a conversation that is not AI_ACTIVE without creating an AiResponse row", async () => {
    const { triggerMessage, organization } = await seedAiActiveConversation({ aiEnabled: false });
    const prisma = getPrisma(app);

    const result = await generateAiReply(prisma, new ExplodingAIProvider(), new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("skipped");
    const responses = await prisma.aiResponse.findMany({ where: { organizationId: organization.id } });
    expect(responses).toHaveLength(0);
  });

  it("sends an AI reply and records usage/cost on the happy path, reusing the existing outbound-send pipeline", async () => {
    const { triggerMessage, conversation } = await seedAiActiveConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([SIMPLE_REPLY_RESULT]);

    const result = await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("sent");

    const aiResponse = await prisma.aiResponse.findUniqueOrThrow({ where: { triggerMessageId: triggerMessage.id } });
    expect(aiResponse.status).toBe("COMPLETED");
    expect(aiResponse.inputTokens).toBe(100_000);
    expect(aiResponse.outputTokens).toBe(20_000);
    expect(aiResponse.costCents).toBe(60); // (100k/1M * $3) + (20k/1M * $15) = $0.60

    expect(aiResponse.resultMessageId).not.toBeNull();

    const resultMessage = await prisma.message.findUniqueOrThrow({ where: { id: aiResponse.resultMessageId! } });
    expect(resultMessage).toMatchObject({ senderType: "AI", direction: "OUTBOUND", status: "PENDING", text: "We're open 9-5!" });

    // Reuses the exact Phase 2 outbound pipeline unchanged - same outbox eventType worker-messaging already consumes.
    const outboxRows = await prisma.outboxEvent.findMany({ where: { aggregateId: resultMessage.id } });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.eventType).toBe("message.outbound_pending");

    const unchangedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(unchangedConversation.automationState).toBe("AI_ACTIVE");
  });

  it("pauses the conversation when the model requests human takeover", async () => {
    const { triggerMessage, conversation } = await seedAiActiveConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "submit_reply",
            input: { reply: "Let me get a human for you.", intent: "complaint", needsHuman: true, actions: ["REQUEST_HUMAN_TAKEOVER"] }
          }
        ],
        usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 0 }
      }
    ]);

    const result = await generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("sent");
    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updatedConversation.automationState).toBe("PAUSED");
  });

  it("does not double-process the same trigger message when claimed concurrently", async () => {
    const { triggerMessage } = await seedAiActiveConversation();
    const prisma = getPrisma(app);
    const provider = new ScriptedAIProvider([SIMPLE_REPLY_RESULT, SIMPLE_REPLY_RESULT]);

    const [a, b] = await Promise.all([
      generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id),
      generateAiReply(prisma, provider, new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id)
    ]);

    expect([a, b].sort()).toEqual(["sent", "skipped"]);
    expect(provider.callCount).toBe(1);
    const responses = await prisma.aiResponse.findMany({ where: { triggerMessageId: triggerMessage.id } });
    expect(responses).toHaveLength(1);
  });

  it("enforces the monthly cost cap without ever calling the AI provider", async () => {
    const { triggerMessage, organization, conversation } = await seedAiActiveConversation({ monthlyCostCapCents: 100 });
    const prisma = getPrisma(app);

    // Seed past spend at/above the cap using a throwaway prior message+response.
    const priorMessage = await prisma.message.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        connectedAccountId: conversation.connectedAccountId,
        provider: "INSTAGRAM",
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: "TEXT",
        text: "Earlier question",
        status: "DELIVERED"
      }
    });
    await prisma.aiResponse.create({
      data: {
        organizationId: organization.id,
        conversationId: conversation.id,
        triggerMessageId: priorMessage.id,
        status: "COMPLETED",
        costCents: 150,
        completedAt: new Date()
      }
    });

    const result = await generateAiReply(prisma, new ExplodingAIProvider(), new FixedEmbeddingProvider(makeVector(0)), DEFAULT_MODEL, triggerMessage.id);

    expect(result).toBe("cost_capped");
    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updatedConversation.automationState).toBe("PAUSED");
    const aiResponse = await prisma.aiResponse.findUniqueOrThrow({ where: { triggerMessageId: triggerMessage.id } });
    expect(aiResponse.status).toBe("SKIPPED");
  });

  describe("searchKnowledge (real pgvector similarity, tenant-scoped)", () => {
    it("ranks the closer chunk first and never returns another organization's chunks", async () => {
      const prisma = getPrisma(app);
      const { organization: orgA } = await createOrgWithOwner(prisma);
      const { organization: orgB } = await createOrgWithOwner(prisma);

      const closeChunk = await insertChunkWithVector(prisma, { organizationId: orgA.id, content: "We are open 9am-5pm every day.", vector: makeVector(0) });
      await insertChunkWithVector(prisma, { organizationId: orgA.id, content: "Our return policy is 30 days.", vector: makeVector(500) });
      await insertChunkWithVector(prisma, { organizationId: orgB.id, content: "Org B secret hours.", vector: makeVector(0) });

      const handlers = buildToolHandlers(prisma, new FixedEmbeddingProvider(makeVector(0)), orgA.id);
      const results = (await handlers.searchKnowledge({ query: "what are your hours" })) as { id: string; content: string }[];

      expect(results[0]?.id).toBe(closeChunk.id);
      expect(results.every((row) => row.id !== undefined)).toBe(true);
      expect(results.map((row) => row.content)).not.toContain("Org B secret hours.");
    });
  });
});
