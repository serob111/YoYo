import type { PrismaClient } from "@yoyo/database";
import type { EmbeddingProvider } from "@yoyo/ai";

export type GenerateEmbeddingResult = "embedded" | "failed" | "not_found" | "skipped";

/**
 * Computing an embedding is side-effect-free and idempotent (same content -> same
 * vector), so unlike generateAiReply this needs no atomic claim - two concurrent
 * runs simply converge on the same result. Exported as a plain function for the
 * same reason as every other worker's handler: the entrypoint and tests both call it directly.
 */
export async function generateEmbedding(prisma: PrismaClient, embeddingProvider: EmbeddingProvider, knowledgeChunkId: string): Promise<GenerateEmbeddingResult> {
  const chunk = await prisma.knowledgeChunk.findUnique({ where: { id: knowledgeChunkId } });
  if (!chunk) return "not_found";
  if (chunk.embeddingStatus === "READY") return "skipped";

  try {
    const { vectors } = await embeddingProvider.embed([chunk.content], "document");
    const vector = vectors[0];
    if (!vector) throw new Error("Embedding provider returned no vector");

    // Unsupported("vector(1024)") Prisma fields aren't reachable through the
    // normal query API at all (read or write) - raw SQL is required.
    const vectorLiteral = `[${vector.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE knowledge_chunks
      SET embedding = ${vectorLiteral}::vector, "embeddingStatus" = 'READY', "updatedAt" = now()
      WHERE id = ${knowledgeChunkId}
    `;
    return "embedded";
  } catch (error) {
    await prisma.knowledgeChunk.update({ where: { id: knowledgeChunkId }, data: { embeddingStatus: "FAILED" } });
    throw error;
  }
}
