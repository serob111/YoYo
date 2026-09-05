import { Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@yoyo/database";
import { PrismaService } from "../common/prisma.service";
import { RequestContext } from "../common/request-context";

export interface RecordAuditEntryInput {
  organizationId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepts an optional transaction client so mutating actions can write their
   * audit entry atomically with the business change (e.g. role change + audit row
   * both commit or both roll back).
   */
  async record(input: RecordAuditEntryInput, tx?: Prisma.TransactionClient | PrismaClient): Promise<void> {
    const client = tx ?? this.prisma.client;
    const requestId = RequestContext.current()?.requestId ?? "unknown";
    await client.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        requestId
      }
    });
  }

  async listForOrganization(organizationId: string, cursor?: string, take = 50) {
    const entries = await this.prisma.client.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { name: true } } }
    });

    const hasMore = entries.length > take;
    const page = hasMore ? entries.slice(0, take) : entries;
    return {
      items: page.map((entry) => ({
        id: entry.id,
        actorId: entry.actorId,
        actorName: entry.actor?.name ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as Record<string, unknown>,
        createdAt: entry.createdAt
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }
}
