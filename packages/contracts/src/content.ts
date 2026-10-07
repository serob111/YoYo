import { z } from "zod";

export const contentPostTypeSchema = z.enum(["IMAGE", "VIDEO", "CAROUSEL"]);
export const contentItemStatusSchema = z.enum([
  "DRAFT",
  "GENERATING",
  "GENERATION_FAILED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PUBLISHING",
  "PUBLISHED",
  "PUBLISH_FAILED",
  "CANCELLED"
]);
export const mediaAssetKindSchema = z.enum(["IMAGE", "VIDEO"]);
export type MediaAssetKind = z.infer<typeof mediaAssetKindSchema>;
export const mediaAssetStatusSchema = z.enum(["UPLOADED", "ENHANCING", "ENHANCED", "ENHANCEMENT_FAILED"]);

export const contentMediaAssetSchema = z.object({
  id: z.string().uuid(),
  contentItemId: z.string().uuid(),
  order: z.number().int().min(0),
  kind: mediaAssetKindSchema,
  mimeType: z.string(),
  byteSize: z.number().int().nullable(),
  status: mediaAssetStatusSchema,
  enhancementPrompt: z.string().nullable(),
  enhancementError: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type ContentMediaAssetDto = z.infer<typeof contentMediaAssetSchema>;

export const contentItemSchema = z.object({
  id: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  propertyId: z.string().uuid().nullable(),
  provider: z.enum(["INSTAGRAM", "TIKTOK"]),
  postType: contentPostTypeSchema,
  caption: z.string().nullable(),
  captionPrompt: z.string().nullable(),
  generationError: z.string().nullable(),
  status: contentItemStatusSchema,
  scheduledFor: z.string().datetime().nullable(),
  autoApproved: z.boolean(),
  approvedAt: z.string().datetime().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable(),
  providerPostId: z.string().nullable(),
  publishErrorMessage: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  media: z.array(contentMediaAssetSchema).optional()
});
export type ContentItemDto = z.infer<typeof contentItemSchema>;

export const createContentItemSchema = z.object({
  connectedAccountId: z.string().uuid(),
  postType: contentPostTypeSchema,
  caption: z.string().max(2200).optional(),
  // Media assets are attached after creation via MediaModule's presigned
  // upload + POST .../content/:id/media - not inline here, since the file
  // bytes themselves never pass through this JSON payload.
  scheduledFor: z.string().datetime().optional(),
  // Set when this post was authored from a Property's "Publish" flow - see
  // addContentMediaAssetFromPropertyMediaSchema for how its media is attached.
  propertyId: z.string().uuid().optional()
});
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>;

export const updateContentItemSchema = z.object({
  caption: z.string().max(2200).optional(),
  scheduledFor: z.string().datetime().nullable().optional()
});
export type UpdateContentItemInput = z.infer<typeof updateContentItemSchema>;

export const generateCaptionSchema = z.object({
  instruction: z.string().max(1000).optional()
});
export type GenerateCaptionInput = z.infer<typeof generateCaptionSchema>;

export const enhanceImageSchema = z.object({
  instruction: z.string().min(1).max(1000)
});
export type EnhanceImageInput = z.infer<typeof enhanceImageSchema>;

export const rejectContentItemSchema = z.object({
  reason: z.string().max(2000).optional()
});
export type RejectContentItemInput = z.infer<typeof rejectContentItemSchema>;

export const scheduleContentItemSchema = z.object({
  scheduledFor: z.string().datetime().nullable()
});
export type ScheduleContentItemInput = z.infer<typeof scheduleContentItemSchema>;

export const addContentMediaAssetSchema = z.object({
  order: z.number().int().min(0).max(9),
  kind: mediaAssetKindSchema,
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive().optional()
});
export type AddContentMediaAssetInput = z.infer<typeof addContentMediaAssetSchema>;

// Copies a property's existing media into this ContentItem (server-side S3
// copy, see MediaService.copyPropertyMediaToContent) rather than requiring a
// fresh upload - the two lifecycles are then fully decoupled, so deleting or
// replacing the source PropertyMedia later can never affect this post.
export const addContentMediaAssetFromPropertyMediaSchema = z.object({
  propertyMediaId: z.string().uuid(),
  order: z.number().int().min(0).max(9)
});
export type AddContentMediaAssetFromPropertyMediaInput = z.infer<typeof addContentMediaAssetFromPropertyMediaSchema>;

export const reorderContentMediaSchema = z.object({
  // Full ordered list of existing media asset ids - re-sequences 0..N-1.
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(10)
});
export type ReorderContentMediaInput = z.infer<typeof reorderContentMediaSchema>;

export const presignedUploadRequestSchema = z.object({
  contentType: z.string().min(1),
  kind: mediaAssetKindSchema
});
export type PresignedUploadRequestInput = z.infer<typeof presignedUploadRequestSchema>;

export const presignedUploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.string().url()
});
export type PresignedUploadResponseDto = z.infer<typeof presignedUploadResponseSchema>;
