import { z } from "zod";

export const contactSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type Contact = z.infer<typeof contactSchema>;

// Manual entry - the only other ways a Contact gets created are Instagram/
// TikTok webhook ingestion and the public storefront's booking flow, neither
// of which covers a walk-in, phone call, or referral an agent hears about
// directly. displayName is the one required field; phone/email are optional
// since an agent may only have a name at first ("someone referred by Anna").
export const createContactSchema = z.object({
  displayName: z.string().min(1).max(200),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional()
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const pipelineStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  order: z.number().int(),
  isWon: z.boolean(),
  isLost: z.boolean()
});
export type PipelineStageDto = z.infer<typeof pipelineStageSchema>;

export const pipelineSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  stages: z.array(pipelineStageSchema)
});
export type PipelineDto = z.infer<typeof pipelineSchema>;

export const leadIntentSchema = z.enum(["BUYER", "RENTER", "SELLER", "LANDLORD"]);
export type LeadIntent = z.infer<typeof leadIntentSchema>;

export const leadSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  title: z.string(),
  intent: leadIntentSchema.nullable(),
  valueCents: z.number().int().nullable(),
  currency: z.string(),
  sourceConversationId: z.string().uuid().nullable(),
  assignedUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable()
});
export type LeadDto = z.infer<typeof leadSchema>;

export const upsertLeadSchema = z.object({
  contactId: z.string().uuid(),
  title: z.string().min(1).max(200),
  intent: leadIntentSchema.nullable().optional(),
  valueCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  assignedUserId: z.string().uuid().nullable().optional()
});
export type UpsertLeadInput = z.infer<typeof upsertLeadSchema>;

export const updateLeadSchema = z.object({
  title: z.string().min(1).max(200),
  intent: leadIntentSchema.nullable().optional(),
  valueCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  assignedUserId: z.string().uuid().nullable().optional()
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const moveLeadStageSchema = z.object({
  stageId: z.string().uuid()
});
export type MoveLeadStageInput = z.infer<typeof moveLeadStageSchema>;

export const addLeadTagSchema = z.object({
  tagId: z.string().uuid()
});
export type AddLeadTagInput = z.infer<typeof addLeadTagSchema>;

export const activityTypeSchema = z.enum(["NOTE", "STAGE_CHANGE", "MESSAGE_LOGGED", "TASK_COMPLETED", "SYSTEM"]);

export const activitySchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  type: activityTypeSchema,
  content: z.string(),
  actorUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime()
});
export type ActivityDto = z.infer<typeof activitySchema>;

// Manual notes only - STAGE_CHANGE/SYSTEM activities are backend-generated,
// never client-supplied.
export const createActivitySchema = z.object({
  content: z.string().min(1).max(2000)
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const taskStatusSchema = z.enum(["OPEN", "DONE", "CANCELLED"]);

export const taskSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().datetime().nullable(),
  status: taskStatusSchema,
  assignedUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
});
export type TaskDto = z.infer<typeof taskSchema>;

export const upsertTaskSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional()
});
export type UpsertTaskInput = z.infer<typeof upsertTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional()
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema
});
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const tagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type TagDto = z.infer<typeof tagSchema>;

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).nullable().optional()
});
export type CreateTagInput = z.infer<typeof createTagSchema>;
