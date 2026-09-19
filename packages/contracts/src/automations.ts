import { z } from "zod";

export const followUpActionTypeSchema = z.enum(["SEND_MESSAGE", "CREATE_TASK"]);
export const followUpStatusSchema = z.enum(["PENDING", "SENDING", "SENT", "CANCELLED", "FAILED"]);

export const followUpSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  actionType: followUpActionTypeSchema,
  actionConfig: z.record(z.string(), z.unknown()),
  scheduledFor: z.string().datetime(),
  status: followUpStatusSchema,
  createdByUserId: z.string().uuid().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  executedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type FollowUpDto = z.infer<typeof followUpSchema>;

// A single discriminated union on actionType - leadId/sendAt are common to
// both variants, the rest of the shape depends on what fires when it's due.
export const createFollowUpSchema = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal("SEND_MESSAGE"),
    leadId: z.string().uuid(),
    sendAt: z.string().datetime(),
    text: z.string().min(1).max(2000)
  }),
  z.object({
    actionType: z.literal("CREATE_TASK"),
    leadId: z.string().uuid(),
    sendAt: z.string().datetime(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional()
  })
]);
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const automationTriggerTypeSchema = z.enum(["LEAD_CREATED", "LEAD_STAGE_CHANGED", "LISTING_MATCHED"]);
export const automationActionTypeSchema = z.enum(["CREATE_FOLLOW_UP", "CREATE_TASK", "ADD_TAG"]);
export const automationExecutionStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED", "SKIPPED"]);

// LEAD_STAGE_CHANGED's toStageId is optional - omitted means "any stage change."
export const automationTriggerSchema = z.discriminatedUnion("triggerType", [
  z.object({ triggerType: z.literal("LEAD_CREATED") }),
  z.object({ triggerType: z.literal("LEAD_STAGE_CHANGED"), toStageId: z.string().uuid().optional() }),
  // Fires when a newly-ACTIVE property matches a contact's saved
  // BuyerPreference - no extra config, matching happens server-side.
  z.object({ triggerType: z.literal("LISTING_MATCHED") })
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

// Capped at 43200 minutes (30 days) - same guardrail as the AI's
// SCHEDULE_FOLLOW_UP action, so neither a human nor the AI can schedule
// something absurdly far out.
export const automationActionSchema = z.discriminatedUnion("actionType", [
  z.object({
    actionType: z.literal("CREATE_FOLLOW_UP"),
    delayMinutes: z.number().int().positive().max(43_200),
    followUpActionType: followUpActionTypeSchema,
    text: z.string().min(1).max(2000).optional(),
    title: z.string().min(1).max(200).optional()
  }),
  z.object({
    actionType: z.literal("CREATE_TASK"),
    title: z.string().min(1).max(200),
    dueInMinutes: z.number().int().positive().max(43_200).optional()
  }),
  z.object({ actionType: z.literal("ADD_TAG"), tagId: z.string().uuid() })
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  trigger: automationTriggerSchema,
  action: automationActionSchema,
  enabled: z.boolean().default(true)
});
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

export const updateAutomationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  trigger: automationTriggerSchema.optional(),
  action: automationActionSchema.optional(),
  enabled: z.boolean().optional()
});
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

export const automationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  triggerType: automationTriggerTypeSchema,
  triggerConfig: z.record(z.string(), z.unknown()).nullable(),
  actionType: automationActionTypeSchema,
  actionConfig: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AutomationDto = z.infer<typeof automationSchema>;

export const automationExecutionSchema = z.object({
  id: z.string().uuid(),
  automationId: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  status: automationExecutionStatusSchema,
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type AutomationExecutionDto = z.infer<typeof automationExecutionSchema>;
