import { z } from "zod";

export const propertyTypeSchema = z.enum(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const propertyStatusSchema = z.enum(["DRAFT", "ACTIVE", "UNDER_OFFER", "SOLD", "RENTED", "ARCHIVED"]);
export type PropertyStatus = z.infer<typeof propertyStatusSchema>;

export const propertyVisibilitySchema = z.enum(["PRIVATE", "ORGANIZATION_STOREFRONT", "MARKETPLACE"]);
export type PropertyVisibility = z.infer<typeof propertyVisibilitySchema>;

export const transactionTypeSchema = z.enum(["SALE", "RENT"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const rentBillingPeriodSchema = z.enum(["DAY", "WEEK", "MONTH"]);
export type RentBillingPeriod = z.infer<typeof rentBillingPeriodSchema>;

export const financingTypeSchema = z.enum(["CASH", "MORTGAGE"]);
export type FinancingType = z.infer<typeof financingTypeSchema>;

export const purchaseTimeframeSchema = z.enum(["IMMEDIATE", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "FLEXIBLE"]);
export type PurchaseTimeframe = z.infer<typeof purchaseTimeframeSchema>;

export const propertySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  propertyType: propertyTypeSchema,
  status: propertyStatusSchema,
  visibility: propertyVisibilitySchema,
  transactionType: transactionTypeSchema,
  // BigInt on the wire - see apps/api/src/main.ts's BigInt.prototype.toJSON.
  // A real AMD-denominated property already exceeds a 32-bit int once
  // converted to cents, so this can't stay a plain number end-to-end.
  priceCents: z.string().nullable(),
  currency: z.string(),
  rentBillingPeriod: rentBillingPeriodSchema.nullable(),
  depositCents: z.string().nullable(),
  minRentalPeriodDays: z.number().int().nullable(),
  availableFrom: z.string().datetime().nullable(),
  country: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  areaSqm: z.number().nullable(),
  floor: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),
  condition: z.string().nullable(),
  buildingType: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type PropertyDto = z.infer<typeof propertySchema>;

// Same shape for create and update (PATCH takes the full shape) - matches
// updateLeadSchema's convention in crm.ts.
export const upsertPropertySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  propertyType: propertyTypeSchema,
  status: propertyStatusSchema.default("DRAFT"),
  visibility: propertyVisibilitySchema.default("PRIVATE"),
  transactionType: transactionTypeSchema,
  priceCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  rentBillingPeriod: rentBillingPeriodSchema.nullable().optional(),
  depositCents: z.number().int().nonnegative().nullable().optional(),
  minRentalPeriodDays: z.number().int().nonnegative().nullable().optional(),
  availableFrom: z.string().datetime().nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  district: z.string().max(200).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  areaSqm: z.number().positive().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  totalFloors: z.number().int().nullable().optional(),
  condition: z.string().max(100).nullable().optional(),
  buildingType: z.string().max(100).nullable().optional()
});
export type UpsertPropertyInput = z.infer<typeof upsertPropertySchema>;

export const addLeadPropertySchema = z.object({
  leadId: z.string().uuid()
});
export type AddLeadPropertyInput = z.infer<typeof addLeadPropertySchema>;

export const buyerPreferenceSchema = z.object({
  contactId: z.string().uuid(),
  transactionType: transactionTypeSchema,
  // BigInt on the wire - see propertySchema.priceCents above.
  minPriceCents: z.string().nullable(),
  maxPriceCents: z.string().nullable(),
  currency: z.string(),
  minAreaSqm: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  districts: z.array(z.string()),
  propertyType: propertyTypeSchema.nullable(),
  furnished: z.boolean().nullable(),
  moveInDate: z.string().datetime().nullable(),
  leaseDurationMonths: z.number().int().nullable(),
  hasPets: z.boolean().nullable(),
  occupantCount: z.number().int().nullable(),
  financingType: financingTypeSchema.nullable(),
  purchaseTimeframe: purchaseTimeframeSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type BuyerPreferenceDto = z.infer<typeof buyerPreferenceSchema>;

export const upsertBuyerPreferenceSchema = z.object({
  transactionType: transactionTypeSchema,
  minPriceCents: z.number().int().nonnegative().nullable().optional(),
  maxPriceCents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  minAreaSqm: z.number().positive().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  districts: z.array(z.string().min(1)).max(20).default([]),
  propertyType: propertyTypeSchema.nullable().optional(),
  furnished: z.boolean().nullable().optional(),
  moveInDate: z.string().datetime().nullable().optional(),
  leaseDurationMonths: z.number().int().nonnegative().nullable().optional(),
  hasPets: z.boolean().nullable().optional(),
  occupantCount: z.number().int().nonnegative().nullable().optional(),
  financingType: financingTypeSchema.nullable().optional(),
  purchaseTimeframe: purchaseTimeframeSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});
export type UpsertBuyerPreferenceInput = z.infer<typeof upsertBuyerPreferenceSchema>;

export const viewingStatusSchema = z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]);
export type ViewingStatus = z.infer<typeof viewingStatusSchema>;

export const viewingSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  leadId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  status: viewingStatusSchema,
  assignedUserId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime()
});
export type ViewingDto = z.infer<typeof viewingSchema>;

export const createViewingSchema = z.object({
  propertyId: z.string().uuid(),
  leadId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  assignedUserId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});
export type CreateViewingInput = z.infer<typeof createViewingSchema>;

export const updateViewingSchema = z.object({
  scheduledFor: z.string().datetime(),
  assignedUserId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});
export type UpdateViewingInput = z.infer<typeof updateViewingSchema>;

export const updateViewingStatusSchema = z.object({
  status: viewingStatusSchema
});
export type UpdateViewingStatusInput = z.infer<typeof updateViewingStatusSchema>;
