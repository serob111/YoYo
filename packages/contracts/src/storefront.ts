import { z } from "zod";
import { propertyTypeSchema, rentBillingPeriodSchema, transactionTypeSchema } from "./real-estate";

// Public-safe subset of Property - no internal fields (status beyond implicit
// "active", visibility, timestamps, etc.). Served with no auth, so nothing
// here should ever be something the org wouldn't want a stranger to see.
export const storefrontPropertySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  propertyType: propertyTypeSchema,
  transactionType: transactionTypeSchema,
  // BigInt on the wire - see real-estate.ts's propertySchema.priceCents.
  priceCents: z.string().nullable(),
  currency: z.string(),
  rentBillingPeriod: rentBillingPeriodSchema.nullable(),
  depositCents: z.string().nullable(),
  minRentalPeriodDays: z.number().int().nullable(),
  availableFrom: z.string().datetime().nullable(),
  country: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  areaSqm: z.number().nullable(),
  floor: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),
  condition: z.string().nullable(),
  buildingType: z.string().nullable()
});
export type StorefrontProperty = z.infer<typeof storefrontPropertySchema>;

export const storefrontSchema = z.object({
  organization: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable()
  }),
  properties: z.array(storefrontPropertySchema)
});
export type Storefront = z.infer<typeof storefrontSchema>;

export const storefrontAvailabilityDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const storefrontAvailabilitySchema = z.object({
  date: z.string(),
  slots: z.array(z.string().datetime())
});
export type StorefrontAvailability = z.infer<typeof storefrontAvailabilitySchema>;

// Deliberately no organizationId/propertyId scoping in the body - both come
// from the URL, which is the storefront's own tenant boundary (see
// StorefrontController). phone is required (the practical way an agent can
// reach a viewing lead back); email is a bonus, not a substitute.
export const bookViewingSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(3).max(40),
  email: z.string().email().nullable().optional(),
  scheduledFor: z.string().datetime(),
  notes: z.string().max(1000).nullable().optional()
});
export type BookViewingInput = z.infer<typeof bookViewingSchema>;

export const bookViewingResultSchema = z.object({
  viewingId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  propertyTitle: z.string(),
  organizationName: z.string()
});
export type BookViewingResult = z.infer<typeof bookViewingResultSchema>;
