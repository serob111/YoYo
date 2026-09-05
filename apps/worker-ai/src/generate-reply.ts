import { getOrCreateDefaultPipeline, resolveNextSendTime, type Prisma, type PrismaClient } from "@yoyo/database";
import { calculateCostCents, runSalesAgent, type AiAction, type AIMessage, type AIProvider, type EmbeddingProvider, type ToolHandlers } from "@yoyo/ai";

export type GenerateAiReplyResult = "sent" | "skipped" | "not_found" | "cost_capped" | "failed";

const HISTORY_SIZE = 20;

function buildSystemPrompt(businessName: string, description: string | null, tone: string | null, timezone: string): string {
  return [
    `You are a helpful sales assistant for ${businessName}, replying to a customer over Instagram DM.`,
    description ? `About the business: ${description}` : null,
    tone ? `Tone/persona instructions: ${tone}` : null,
    `The business's timezone is ${timezone}.`,
    "Use the available tools to look up real product, service, and knowledge-base information before answering - never invent prices, availability, or policies.",
    "Reply in the same language the customer is writing in.",
    "If the customer shows buying intent, check getContactLeads first to avoid creating a duplicate lead, then propose CREATE_LEAD if none fits. Use UPDATE_LEAD_STAGE to reflect real progress. Only tag via ADD_TAG using an id from getTags - never invent a new tag name. If it would help to check back later (e.g. the customer needs time to decide, or you promised to follow up), propose SCHEDULE_FOLLOW_UP with a delay in minutes and the message to send then - you can omit leadId if you just created the lead in this same reply.",
    "You must end your turn by calling submit_reply exactly once with your final answer - do not call it more than once, and do not answer in plain text."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function toAgentMessages(history: { senderType: string; text: string | null }[]): AIMessage[] {
  return history
    .filter((message) => message.senderType !== "SYSTEM" && message.text)
    .map((message) => ({
      role: message.senderType === "CUSTOMER" ? "user" : "assistant",
      content: [{ type: "text", text: message.text! }]
    }));
}

export function buildToolHandlers(
  prisma: PrismaClient,
  embeddingProvider: EmbeddingProvider,
  organizationId: string,
  contactId: string
): ToolHandlers {
  return {
    async searchKnowledge({ query }) {
      const { vectors } = await embeddingProvider.embed([query], "query");
      const vectorLiteral = `[${vectors[0]?.join(",") ?? ""}]`;
      return prisma.$queryRaw<{ id: string; content: string }[]>`
        SELECT id, content FROM knowledge_chunks
        WHERE "organizationId" = ${organizationId} AND "embeddingStatus" = 'READY'
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT 5
      `;
    },
    async findProduct({ name }) {
      return prisma.product.findMany({
        where: { organizationId, active: true, name: { contains: name, mode: "insensitive" } },
        take: 5,
        select: { id: true, name: true, description: true, priceCents: true, currency: true }
      });
    },
    async getProductPrice({ productId }) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product || product.organizationId !== organizationId) return { error: "not_found" };
      return { name: product.name, priceCents: product.priceCents, currency: product.currency, active: product.active };
    },
    async findService({ name }) {
      return prisma.service.findMany({
        where: { organizationId, active: true, name: { contains: name, mode: "insensitive" } },
        take: 5,
        select: { id: true, name: true, description: true, priceCents: true, currency: true, durationMinutes: true }
      });
    },
    async getServicePrice({ serviceId }) {
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service || service.organizationId !== organizationId) return { error: "not_found" };
      return { name: service.name, priceCents: service.priceCents, currency: service.currency, durationMinutes: service.durationMinutes };
    },
    async getOpeningHours() {
      const profile = await prisma.businessProfile.findUnique({ where: { organizationId } });
      return { timezone: profile?.timezone ?? "UTC", businessHours: profile?.businessHours ?? null };
    },
    async getContactLeads() {
      const leads = await prisma.lead.findMany({
        where: { organizationId, contactId },
        include: { stage: true },
        orderBy: { updatedAt: "desc" }
      });
      return leads.map((lead) => ({ id: lead.id, title: lead.title, stageName: lead.stage.name, isWon: lead.stage.isWon, isLost: lead.stage.isLost }));
    },
    async getPipelineStages() {
      const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
      return pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name, isWon: stage.isWon, isLost: stage.isLost }));
    },
    async getTags() {
      const tags = await prisma.tag.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
      return tags.map((tag) => ({ id: tag.id, name: tag.name }));
    }
  };
}

/**
 * Executes the AI's proposed CREATE_LEAD/UPDATE_LEAD_STAGE/ADD_TAG actions
 * (declarative, per ADR-0005 - not live tool calls). Every referenced
 * lead/stage/tag id is re-validated against organizationId here, even though
 * the ids came from this same org's read tools moments earlier - a
 * hallucinated or otherwise-invalid id is skipped silently (not thrown) so one
 * bogus proposed action never blocks the customer-facing reply from sending.
 */
async function applyAiActions(
  tx: Prisma.TransactionClient,
  context: {
    organizationId: string;
    conversationId: string;
    contactId: string;
    timezone: string;
    businessHours: unknown;
  },
  actions: AiAction[]
): Promise<{ requestedHumanTakeover: boolean }> {
  let requestedHumanTakeover = false;

  for (const action of actions) {
    switch (action.type) {
      case "REQUEST_HUMAN_TAKEOVER":
        requestedHumanTakeover = true;
        break;

      case "CREATE_LEAD": {
        const pipeline = await getOrCreateDefaultPipeline(tx, context.organizationId);
        const firstStage = pipeline.stages[0];
        if (!firstStage) break;
        const lead = await tx.lead.create({
          data: {
            organizationId: context.organizationId,
            contactId: context.contactId,
            pipelineId: pipeline.id,
            stageId: firstStage.id,
            title: action.title,
            sourceConversationId: context.conversationId
          }
        });
        await tx.activity.create({
          data: { organizationId: context.organizationId, leadId: lead.id, type: "SYSTEM", content: `Lead created by AI: ${action.title}` }
        });
        // Inlined rather than importing apps/api's OutboxService, matching how
        // message.outbound_pending is already inlined below - workers don't
        // import from other apps.
        await tx.outboxEvent.create({
          data: {
            organizationId: context.organizationId,
            aggregateType: "Lead",
            aggregateId: lead.id,
            eventType: "lead.created",
            payload: { requestId: "worker-ai" }
          }
        });
        break;
      }

      case "UPDATE_LEAD_STAGE": {
        const lead = await tx.lead.findUnique({ where: { id: action.leadId } });
        if (!lead || lead.organizationId !== context.organizationId) break;
        const stage = await tx.pipelineStage.findUnique({ where: { id: action.stageId } });
        if (!stage || stage.pipelineId !== lead.pipelineId) break;
        const isClosing = stage.isWon || stage.isLost;
        await tx.lead.update({
          where: { id: lead.id },
          data: { stageId: stage.id, closedAt: isClosing ? new Date() : null }
        });
        await tx.activity.create({
          data: { organizationId: context.organizationId, leadId: lead.id, type: "STAGE_CHANGE", content: `Stage changed to ${stage.name} by AI` }
        });
        // Don't follow up on a deal the AI just closed.
        if (isClosing) {
          await tx.followUp.updateMany({
            where: { leadId: lead.id, status: "PENDING" },
            data: { status: "CANCELLED", cancelledAt: new Date() }
          });
        }
        await tx.outboxEvent.create({
          data: {
            organizationId: context.organizationId,
            aggregateType: "Lead",
            aggregateId: lead.id,
            eventType: "lead.stage_changed",
            payload: { requestId: "worker-ai", fromStageId: lead.stageId, toStageId: stage.id }
          }
        });
        break;
      }

      case "ADD_TAG": {
        const lead = await tx.lead.findUnique({ where: { id: action.leadId } });
        if (!lead || lead.organizationId !== context.organizationId) break;
        const tag = await tx.tag.findUnique({ where: { id: action.tagId } });
        if (!tag || tag.organizationId !== context.organizationId) break;
        await tx.leadTag.upsert({
          where: { leadId_tagId: { leadId: lead.id, tagId: tag.id } },
          create: { leadId: lead.id, tagId: tag.id },
          update: {}
        });
        break;
      }

      case "SCHEDULE_FOLLOW_UP": {
        const lead = action.leadId
          ? await tx.lead.findUnique({ where: { id: action.leadId } })
          : await tx.lead.findFirst({ where: { organizationId: context.organizationId, contactId: context.contactId }, orderBy: { createdAt: "desc" } });
        if (!lead || lead.organizationId !== context.organizationId) break;

        const requestedAt = new Date(Date.now() + action.delayMinutes * 60_000);
        const scheduledFor = resolveNextSendTime(requestedAt, context.timezone, context.businessHours);
        await tx.followUp.create({
          data: {
            organizationId: context.organizationId,
            leadId: lead.id,
            actionType: "SEND_MESSAGE",
            actionConfig: { text: action.message },
            scheduledFor
            // createdByUserId left null - AI-originated.
          }
        });
        break;
      }
    }
  }

  return { requestedHumanTakeover };
}

/**
 * Exported as a plain function (not tied to BullMQ) for the same reason as
 * normalizeWebhookEvent/sendPendingMessage: the worker entrypoint and
 * integration tests both call it directly. The atomic claim here is
 * AiResponse.triggerMessageId's unique constraint - a duplicate create() fails
 * with P2002, which is treated as "already being/been handled".
 */
export async function generateAiReply(
  prisma: PrismaClient,
  aiProvider: AIProvider,
  embeddingProvider: EmbeddingProvider,
  defaultModel: string,
  triggerMessageId: string
): Promise<GenerateAiReplyResult> {
  const triggerMessage = await prisma.message.findUnique({ where: { id: triggerMessageId } });
  if (!triggerMessage) return "not_found";

  const conversation = await prisma.conversation.findUnique({ where: { id: triggerMessage.conversationId } });
  if (!conversation) return "not_found";
  if (conversation.automationState !== "AI_ACTIVE") return "skipped";

  const organizationId = conversation.organizationId;

  let aiResponse;
  try {
    aiResponse = await prisma.aiResponse.create({
      data: { organizationId, conversationId: conversation.id, triggerMessageId, status: "PENDING" }
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return "skipped";
    }
    throw error;
  }

  const businessProfile = await prisma.businessProfile.findUnique({ where: { organizationId } });
  const model = businessProfile?.defaultModel ?? defaultModel;

  if (businessProfile?.monthlyCostCapCents != null) {
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const spent = await prisma.aiResponse.aggregate({
      where: { organizationId, status: "COMPLETED", createdAt: { gte: startOfMonth } },
      _sum: { costCents: true }
    });
    if ((spent._sum.costCents ?? 0) >= businessProfile.monthlyCostCapCents) {
      await prisma.$transaction([
        prisma.aiResponse.update({ where: { id: aiResponse.id }, data: { status: "SKIPPED", completedAt: new Date() } }),
        prisma.conversation.update({ where: { id: conversation.id }, data: { automationState: "PAUSED" } }),
        prisma.message.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            connectedAccountId: conversation.connectedAccountId,
            provider: conversation.provider,
            direction: "OUTBOUND",
            senderType: "SYSTEM",
            messageType: "SYSTEM",
            text: "AI paused: this organization's monthly AI cost cap has been reached.",
            status: "DELIVERED"
          }
        })
      ]);
      return "cost_capped";
    }
  }

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_SIZE,
    select: { senderType: true, text: true }
  });

  const agentResult = await runSalesAgent(
    { aiProvider, tools: buildToolHandlers(prisma, embeddingProvider, organizationId, conversation.contactId) },
    {
      model,
      systemPrompt: buildSystemPrompt(
        businessProfile?.businessName ?? "the business",
        businessProfile?.description ?? null,
        businessProfile?.tone ?? null,
        businessProfile?.timezone ?? "UTC"
      ),
      messages: toAgentMessages(history.reverse())
    }
  );

  const costCents = calculateCostCents(model, agentResult.usage);

  if (!agentResult.reply) {
    await prisma.$transaction([
      prisma.aiResponse.update({
        where: { id: aiResponse.id },
        data: {
          status: "FAILED",
          model,
          inputTokens: agentResult.usage.inputTokens,
          outputTokens: agentResult.usage.outputTokens,
          cacheReadTokens: agentResult.usage.cacheReadTokens,
          cacheCreationTokens: agentResult.usage.cacheCreationTokens,
          costCents,
          toolCallCount: agentResult.toolCallCount,
          errorMessage: "Agent did not produce a valid structured reply",
          completedAt: new Date()
        }
      }),
      prisma.conversation.update({ where: { id: conversation.id }, data: { automationState: "PAUSED" } }),
      prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: conversation.connectedAccountId,
          provider: conversation.provider,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          messageType: "SYSTEM",
          text: "AI was unable to generate a reply and has paused - a human needs to take over this conversation.",
          status: "DELIVERED"
        }
      })
    ]);
    return "failed";
  }

  const reply = agentResult.reply;
  await prisma.$transaction(async (tx) => {
    const resultMessage = await tx.message.create({
      data: {
        organizationId,
        conversationId: conversation.id,
        connectedAccountId: conversation.connectedAccountId,
        provider: conversation.provider,
        direction: "OUTBOUND",
        senderType: "AI",
        messageType: "TEXT",
        text: reply.reply,
        status: "PENDING"
      }
    });

    const { requestedHumanTakeover } = await applyAiActions(
      tx,
      {
        organizationId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        timezone: businessProfile?.timezone ?? "UTC",
        businessHours: businessProfile?.businessHours ?? null
      },
      reply.actions
    );

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(requestedHumanTakeover ? { automationState: "PAUSED" as const } : {})
      }
    });

    // Inlined rather than importing apps/api's OutboxService - workers don't
    // import from other apps. Reuses the existing outbound-send pipeline
    // unchanged: worker-messaging picks this up exactly like a human-sent message.
    await tx.outboxEvent.create({
      data: {
        organizationId,
        aggregateType: "Message",
        aggregateId: resultMessage.id,
        eventType: "message.outbound_pending",
        payload: { requestId: "worker-ai" }
      }
    });

    await tx.aiResponse.update({
      where: { id: aiResponse.id },
      data: {
        status: "COMPLETED",
        resultMessageId: resultMessage.id,
        model,
        inputTokens: agentResult.usage.inputTokens,
        outputTokens: agentResult.usage.outputTokens,
        cacheReadTokens: agentResult.usage.cacheReadTokens,
        cacheCreationTokens: agentResult.usage.cacheCreationTokens,
        costCents,
        toolCallCount: agentResult.toolCallCount,
        completedAt: new Date()
      }
    });
  });

  return "sent";
}
