import { z } from "zod";
import { propertyStatusSchema, propertyTypeSchema, transactionTypeSchema } from "./real-estate";

export const startSocialSyncSchema = z.object({
  connectedAccountId: z.string().uuid()
});
export type StartSocialSyncInput = z.infer<typeof startSocialSyncSchema>;

export const socialSyncStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "PARTIAL"]);
export type SocialSyncStatus = z.infer<typeof socialSyncStatusSchema>;

export const socialSyncSchema = z.object({
  id: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  type: z.enum(["INITIAL", "INCREMENTAL"]),
  status: socialSyncStatusSchema,
  totalItems: z.number().int(),
  processedItems: z.number().int(),
  propertyRelatedItems: z.number().int(),
  candidateCount: z.number().int(),
  errorCount: z.number().int(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type SocialSyncDto = z.infer<typeof socialSyncSchema>;

export const socialMediaItemSummarySchema = z.object({
  id: z.string().uuid(),
  mediaType: z.enum(["IMAGE", "VIDEO", "REEL", "CAROUSEL"]),
  thumbnailUrl: z.string().nullable(),
  permalink: z.string().nullable(),
  caption: z.string().nullable(),
  postedAt: z.string().datetime().nullable()
});
export type SocialMediaItemSummary = z.infer<typeof socialMediaItemSummarySchema>;

export const propertyImportCandidateStatusSchema = z.enum(["PENDING_REVIEW", "IMPORTED", "LINKED_EXISTING", "IGNORED"]);
export type PropertyImportCandidateStatus = z.infer<typeof propertyImportCandidateStatusSchema>;

export const propertyImportCandidateSchema = z.object({
  id: z.string().uuid(),
  connectedAccountId: z.string().uuid(),
  status: propertyImportCandidateStatusSchema,
  confidence: z.number(),
  transactionType: transactionTypeSchema,
  propertyType: propertyTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  // BigInt on the wire - see real-estate.ts's propertySchema.priceCents.
  priceCents: z.string().nullable(),
  currency: z.string(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  address: z.string().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  areaSqm: z.number().nullable(),
  availabilityHint: z.string().nullable(),
  possibleExistingPropertyId: z.string().uuid().nullable(),
  possibleExistingPropertyTitle: z.string().nullable().optional(),
  importedPropertyId: z.string().uuid().nullable(),
  items: z.array(socialMediaItemSummarySchema),
  createdAt: z.string().datetime()
});
export type PropertyImportCandidateDto = z.infer<typeof propertyImportCandidateSchema>;

export const updatePropertyImportCandidateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  transactionType: transactionTypeSchema.optional(),
  propertyType: propertyTypeSchema.optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  country: z.string().max(100).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  district: z.string().max(200).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  areaSqm: z.number().positive().nullable().optional()
});
export type UpdatePropertyImportCandidateInput = z.infer<typeof updatePropertyImportCandidateSchema>;

export const importPropertyImportCandidateSchema = z.object({
  status: propertyStatusSchema.default("DRAFT")
});
export type ImportPropertyImportCandidateInput = z.infer<typeof importPropertyImportCandidateSchema>;

export const linkPropertyImportCandidateSchema = z.object({
  propertyId: z.string().uuid()
});
export type LinkPropertyImportCandidateInput = z.infer<typeof linkPropertyImportCandidateSchema>;

export const sampleLeadSchema = z.object({
  message: z.string().min(1).max(2000)
});
export type SampleLeadInput = z.infer<typeof sampleLeadSchema>;

export const propertyMediaSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["IMAGE", "VIDEO", "FLOORPLAN", "OTHER"]),
  storageKey: z.string().nullable(),
  externalUrl: z.string().nullable(),
  source: z.enum(["MANUAL", "INSTAGRAM", "TIKTOK"]),
  isCover: z.boolean(),
  position: z.number().int()
});
export type PropertyMediaDto = z.infer<typeof propertyMediaSchema>;
