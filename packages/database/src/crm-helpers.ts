import type { Pipeline, PipelineStage, Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_PIPELINE_NAME = "Default Pipeline";

interface StagePreset {
  name: string;
  order: number;
  isWon?: boolean;
  isLost?: boolean;
}

// Vertical-specific default stage presets. Kept as a small local map rather
// than a dependency on @yoyo/verticals - this is the one place
// packages/database needs vertical awareness, and it's a plain lookup table,
// not shared nav/config. Falls back to "core" for null/unrecognized verticals,
// matching packages/verticals' own getVerticalConfig fallback.
const PIPELINE_STAGE_PRESETS: Record<string, StagePreset[]> = {
  core: [
    { name: "New", order: 0 },
    { name: "Contacted", order: 1 },
    { name: "AI Qualifying", order: 2 },
    { name: "Qualified", order: 3 },
    { name: "Nurture", order: 4 },
    { name: "Won", order: 5, isWon: true },
    { name: "Lost", order: 6, isLost: true }
  ],
  real_estate: [
    { name: "New Lead", order: 0 },
    { name: "AI Qualifying", order: 1 },
    { name: "Property Matching", order: 2 },
    { name: "Properties Sent", order: 3 },
    { name: "Viewing Requested", order: 4 },
    { name: "Viewing Scheduled", order: 5 },
    { name: "Negotiation", order: 6 },
    { name: "Nurture", order: 7 },
    { name: "Won", order: 8, isWon: true },
    { name: "Lost", order: 9, isLost: true }
  ]
};

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

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { vertical: true } });
  const stages = PIPELINE_STAGE_PRESETS[organization?.vertical ?? ""] ?? PIPELINE_STAGE_PRESETS.core!;

  try {
    return await prisma.pipeline.create({
      data: {
        organizationId,
        name: DEFAULT_PIPELINE_NAME,
        stages: { create: stages }
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
