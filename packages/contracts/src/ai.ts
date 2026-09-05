import { z } from "zod";
import { conversationAutomationStateSchema } from "./conversations";

const businessHoursSchema = z.record(z.string(), z.object({ open: z.string(), close: z.string() }));

export const businessProfileSchema = z.object({
  businessName: z.string(),
  description: z.string().nullable(),
  tone: z.string().nullable(),
  timezone: z.string(),
  businessHours: businessHoursSchema.nullable(),
  aiEnabled: z.boolean(),
  defaultModel: z.string().nullable(),
  monthlyCostCapCents: z.number().int().nullable()
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const upsertBusinessProfileSchema = z.object({
  businessName: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  tone: z.string().max(2000).nullable().optional(),
  timezone: z.string().min(1).default("UTC"),
  businessHours: businessHoursSchema.nullable().optional(),
  aiEnabled: z.boolean().default(false),
  defaultModel: z.string().nullable().optional(),
  monthlyCostCapCents: z.number().int().positive().nullable().optional()
});
export type UpsertBusinessProfileInput = z.infer<typeof upsertBusinessProfileSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime()
});
export type Product = z.infer<typeof productSchema>;

export const upsertProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  active: z.boolean().default(true)
});
export type UpsertProductInput = z.infer<typeof upsertProductSchema>;

export const serviceSchema = productSchema.extend({ durationMinutes: z.number().int().nullable() });
export type Service = z.infer<typeof serviceSchema>;

export const upsertServiceSchema = upsertProductSchema.extend({
  durationMinutes: z.number().int().positive().nullable().optional()
});
export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>;

export const knowledgeSourceTypeSchema = z.enum(["MANUAL", "PRODUCT", "SERVICE", "FAQ"]);
export const knowledgeEmbeddingStatusSchema = z.enum(["PENDING", "READY", "FAILED"]);

export const knowledgeChunkSchema = z.object({
  id: z.string().uuid(),
  sourceType: knowledgeSourceTypeSchema,
  sourceId: z.string().nullable(),
  content: z.string(),
  embeddingStatus: knowledgeEmbeddingStatusSchema,
  createdAt: z.string().datetime()
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const createKnowledgeChunkSchema = z.object({
  content: z.string().min(1).max(4000),
  sourceType: knowledgeSourceTypeSchema.default("MANUAL"),
  sourceId: z.string().uuid().nullable().optional()
});
export type CreateKnowledgeChunkInput = z.infer<typeof createKnowledgeChunkSchema>;

export const setConversationAutomationStateSchema = z.object({
  automationState: conversationAutomationStateSchema
});
export type SetConversationAutomationStateInput = z.infer<typeof setConversationAutomationStateSchema>;
