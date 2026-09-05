import { Injectable } from "@nestjs/common";
import type { CreateKnowledgeChunkInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { NotFoundDomainError } from "../common/domain-errors";
import { RequestContext } from "../common/request-context";

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async list(organizationId: string, cursor?: string, take = 50) {
    const chunks = await this.prisma.client.knowledgeChunk.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = chunks.length > take;
    const page = hasMore ? chunks.slice(0, take) : chunks;
    return {
      items: page.map((chunk) => ({
        id: chunk.id,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        content: chunk.content,
        embeddingStatus: chunk.embeddingStatus,
        createdAt: chunk.createdAt
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async getOrThrow(organizationId: string, chunkId: string) {
    const chunk = await this.prisma.client.knowledgeChunk.findUnique({ where: { id: chunkId } });
    if (!chunk || chunk.organizationId !== organizationId) throw new NotFoundDomainError("Knowledge chunk");
    return chunk;
  }

  // Embedding is always computed asynchronously by apps/worker-ai, never inline
  // here - the API must never call an external provider/LLM synchronously
  // inside a request (docs/architecture/overview.md).
  async create(organizationId: string, input: CreateKnowledgeChunkInput) {
    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const chunk = await tx.knowledgeChunk.create({
        data: {
          organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          content: input.content,
          embeddingStatus: "PENDING"
        }
      });

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "KnowledgeChunk",
        aggregateId: chunk.id,
        eventType: "knowledge_chunk.embedding_pending",
        payload: { requestId }
      });

      return chunk;
    });
  }

  async remove(organizationId: string, chunkId: string) {
    await this.getOrThrow(organizationId, chunkId);
    await this.prisma.client.knowledgeChunk.delete({ where: { id: chunkId } });
  }
}
