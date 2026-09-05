import { resolveNextSendTime, type PrismaClient } from "@yoyo/database";

export type ProcessAutomationTriggerResult = "processed" | "not_found";

export interface AutomationTriggerContext {
  outboxEventId: string;
  eventType: "lead.created" | "lead.stage_changed";
  organizationId: string;
  leadId: string;
  payload: Record<string, unknown>;
}

interface CreateFollowUpActionConfig {
  delayMinutes: number;
  followUpActionType: "SEND_MESSAGE" | "CREATE_TASK";
  text?: string;
  title?: string;
}

interface CreateTaskActionConfig {
  title: string;
  dueInMinutes?: number;
}

interface AddTagActionConfig {
  tagId: string;
}

/**
 * Exported as a plain function, same reason as every other worker's handler.
 * The idempotency claim is AutomationExecution's create() with
 * @@unique([automationId, triggerEventId]) - mirrors AiResponse's
 * triggerMessageId claim exactly: a duplicate attempt for the same
 * (automation, event) pair hits P2002 and is skipped.
 */
export async function processAutomationTrigger(prisma: PrismaClient, context: AutomationTriggerContext): Promise<ProcessAutomationTriggerResult> {
  const lead = await prisma.lead.findUnique({ where: { id: context.leadId } });
  if (!lead) return "not_found";

  const triggerType = context.eventType === "lead.created" ? "LEAD_CREATED" : "LEAD_STAGE_CHANGED";
  const automations = await prisma.automation.findMany({
    where: { organizationId: context.organizationId, triggerType, enabled: true }
  });

  for (const automation of automations) {
    if (triggerType === "LEAD_STAGE_CHANGED" && automation.triggerConfig) {
      const config = automation.triggerConfig as { toStageId?: string };
      if (config.toStageId && config.toStageId !== context.payload.toStageId) continue;
    }

    let execution;
    try {
      execution = await prisma.automationExecution.create({
        data: {
          automationId: automation.id,
          organizationId: context.organizationId,
          leadId: lead.id,
          triggerEventId: context.outboxEventId,
          status: "PENDING"
        }
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") continue; // already processed
      throw error;
    }

    try {
      await runAutomationAction(prisma, automation, lead);
      await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: "COMPLETED" } });
    } catch (error) {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  return "processed";
}

async function runAutomationAction(
  prisma: PrismaClient,
  automation: { actionType: string; actionConfig: unknown },
  lead: { id: string; organizationId: string }
): Promise<void> {
  switch (automation.actionType) {
    case "CREATE_FOLLOW_UP": {
      const config = automation.actionConfig as unknown as CreateFollowUpActionConfig;
      const businessProfile = await prisma.businessProfile.findUnique({ where: { organizationId: lead.organizationId } });
      const requestedAt = new Date(Date.now() + config.delayMinutes * 60_000);
      const scheduledFor = resolveNextSendTime(requestedAt, businessProfile?.timezone ?? "UTC", businessProfile?.businessHours ?? null);
      await prisma.followUp.create({
        data: {
          organizationId: lead.organizationId,
          leadId: lead.id,
          actionType: config.followUpActionType,
          actionConfig: config.followUpActionType === "SEND_MESSAGE" ? { text: config.text ?? "" } : { title: config.title ?? "Follow up" },
          scheduledFor
        }
      });
      return;
    }
    case "CREATE_TASK": {
      const config = automation.actionConfig as unknown as CreateTaskActionConfig;
      await prisma.task.create({
        data: {
          organizationId: lead.organizationId,
          leadId: lead.id,
          title: config.title,
          dueAt: config.dueInMinutes ? new Date(Date.now() + config.dueInMinutes * 60_000) : null
        }
      });
      return;
    }
    case "ADD_TAG": {
      const config = automation.actionConfig as unknown as AddTagActionConfig;
      const tag = await prisma.tag.findUnique({ where: { id: config.tagId } });
      if (!tag || tag.organizationId !== lead.organizationId) return; // hallucinated/cross-tenant id - skip silently
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId: lead.id, tagId: tag.id } },
        create: { leadId: lead.id, tagId: tag.id },
        update: {}
      });
      return;
    }
    default:
      throw new Error(`Unknown automation action type: ${automation.actionType}`);
  }
}
