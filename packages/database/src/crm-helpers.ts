import type { Pipeline, PipelineStage, Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_PIPELINE_NAME = "Default Pipeline";

const DEFAULT_STAGES = [
  { name: "New", order: 0 },
  { name: "Contacted", order: 1 },
  { name: "Qualified", order: 2 },
  { name: "Won", order: 3, isWon: true },
  { name: "Lost", order: 4, isLost: true }
];

export type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

/**
 * MVP is one pipeline per org, auto-created on first use (see Pipeline's
 * schema comment) - both apps/api's LeadsService and apps/worker-ai's
 * generate-reply.ts need this, so it lives here rather than being duplicated
 * per-app. Pipeline.@@unique([organizationId, name]) makes the race safe: a
 * concurrent create() loses with P2002, then re-fetches the winner instead of
 * duplicating.
 */
export async function getOrCreateDefaultPipeline(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string
): Promise<PipelineWithStages> {
  const existing = await prisma.pipeline.findFirst({
    where: { organizationId },
    include: { stages: { orderBy: { order: "asc" } } }
  });
  if (existing) return existing;

  try {
    return await prisma.pipeline.create({
      data: {
        organizationId,
        name: DEFAULT_PIPELINE_NAME,
        stages: { create: DEFAULT_STAGES }
      },
      include: { stages: { orderBy: { order: "asc" } } }
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const raceWinner = await prisma.pipeline.findFirst({
        where: { organizationId },
        include: { stages: { orderBy: { order: "asc" } } }
      });
      if (raceWinner) return raceWinner;
    }
    throw error;
  }
}
