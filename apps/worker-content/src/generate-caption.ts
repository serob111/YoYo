import type { PrismaClient } from "@yoyo/database";
import type { AIProvider } from "@yoyo/ai";

export type GenerateCaptionResult = "generated" | "skipped" | "not_found" | "failed";

function buildSystemPrompt(businessName: string, tone: string | null, postType: string): string {
  const lines = [
    `You write social media captions for ${businessName}.`,
    tone ? `Tone/persona instructions: ${tone}` : null,
    `The post is a ${postType.toLowerCase()} post. Write a single engaging caption (no hashtags unless asked). Respond with the caption text only - no preamble, no quotes.`
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Single-shot generation (no tool loop, no RAG) - this isn't the conversational
 * sales agent (packages/ai/src/agent/sales-agent.ts), just one AIProvider.complete()
 * call. Exported as a plain function so both the worker entrypoint and tests
 * call it directly, same convention as every other worker handler.
 */
export async function generateCaption(prisma: PrismaClient, aiProvider: AIProvider, defaultModel: string, contentItemId: string, instruction?: string): Promise<GenerateCaptionResult> {
  const claimed = await prisma.contentItem.updateMany({
    where: { id: contentItemId, status: { in: ["DRAFT", "GENERATION_FAILED"] } },
    data: { status: "GENERATING" }
  });
  if (claimed.count === 0) return "skipped";

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) return "not_found";

  try {
    const businessProfile = await prisma.businessProfile.findUnique({ where: { organizationId: item.organizationId } });
    const model = businessProfile?.defaultModel ?? defaultModel;

    const result = await aiProvider.complete({
      model,
      system: buildSystemPrompt(businessProfile?.businessName ?? "the business", businessProfile?.tone ?? null, item.postType),
      maxTokens: 400,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: instruction ?? "Write an engaging caption for this post." }]
        }
      ]
    });

    const textBlock = result.content.find((block) => block.type === "text");
    const caption = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (!caption) throw new Error("AI returned no caption text");

    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: "DRAFT", caption, captionPrompt: instruction ?? null, generationError: null }
    });
    return "generated";
  } catch (error) {
    // Claim is terminal on failure (not reverted-and-rethrown for a BullMQ
    // auto-retry) - a fresh POST .../generate-caption re-claims from
    // GENERATION_FAILED, same "human retries explicitly" model as a rejected
    // draft. Avoids the footgun where a claim-then-throw makes a queue retry
    // an immediate no-op skip (the row isn't back in a claimable status yet).
    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { status: "GENERATION_FAILED", generationError: error instanceof Error ? error.message : String(error) }
    });
    return "failed";
  }
}
