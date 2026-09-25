import { z } from "zod";
import type { PrismaClient } from "@yoyo/database";
import type { AIToolDefinition } from "@yoyo/ai";

// All real-estate-specific AI knowledge lives here, deliberately kept out of
// packages/ai (Core, vertical-agnostic) and out of the shared parts of
// generate-reply.ts. Wired in only when Organization.vertical === "real_estate"
// (see generate-reply.ts) - a non-real-estate org's request never references
// anything in this file.

export const SearchPropertiesInputSchema = z.object({
  // Required, not inferred - this is what stops a $1,500/month RENT search
  // from matching a $1,500 SALE-priced listing at the same price point.
  transactionType: z.enum(["SALE", "RENT"]),
  maxPriceCents: z.number().int().positive().optional(),
  // Scopes any price filter to same-currency listings - see the where clause
  // below. Defaulted (never undefined) so a maxPriceCents filter can never
  // apply without an explicit currency to scope it to.
  currency: z.string().length(3).default("USD"),
  minAreaSqm: z.number().positive().optional(),
  bedrooms: z.number().int().nonnegative().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  districts: z.array(z.string()).optional(),
  propertyType: z.enum(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"]).optional()
});

export const REAL_ESTATE_TOOL_DEFS: AIToolDefinition[] = [
  {
    name: "searchProperties",
    description:
      "Search the business's active property listings by structured criteria. Use this whenever the customer describes what kind of property they're looking for (budget, size, bedrooms, location, type).",
    inputSchema: {
      type: "object",
      properties: {
        transactionType: {
          type: "string",
          enum: ["SALE", "RENT"],
          description: "Whether the customer wants to buy (SALE) or rent (RENT). Always determine this before searching."
        },
        maxPriceCents: {
          type: "integer",
          description: "Maximum price in cents, if the customer gave a budget. For RENT, this is the max per-period rent, not a total."
        },
        currency: {
          type: "string",
          description: "3-letter currency code the budget was given in (e.g. AED, EUR, USD). Always include this whenever you pass maxPriceCents - listings in a different currency are never numerically comparable to it."
        },
        minAreaSqm: { type: "number", description: "Minimum area in square meters." },
        bedrooms: { type: "integer", description: "Minimum number of bedrooms." },
        country: { type: "string", description: "Country to search in, if the customer mentioned one (relevant for agencies operating in multiple countries)." },
        city: { type: "string", description: "City to search in, if the customer mentioned one." },
        districts: { type: "array", items: { type: "string" }, description: "Districts/neighborhoods to search in." },
        propertyType: { type: "string", enum: ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"] }
      },
      required: ["transactionType"],
      additionalProperties: false
    }
  }
];

export const REAL_ESTATE_ACTION_VARIANTS: Record<string, unknown>[] = [
  {
    type: "object",
    properties: {
      type: { const: "CREATE_VIEWING" },
      propertyId: { type: "string", description: "The property id from a prior searchProperties call." },
      leadId: { type: "string", description: "Omit to use the customer's most recently created lead." },
      delayMinutes: { type: "integer", minimum: 1, maximum: 43200, description: "When to schedule the viewing, minutes from now." },
      notes: { type: "string" }
    },
    required: ["type", "propertyId", "delayMinutes"],
    additionalProperties: false
  },
  {
    type: "object",
    properties: {
      type: { const: "UPDATE_BUYER_PREFERENCES" },
      transactionType: { type: "string", enum: ["SALE", "RENT"], description: "Whether this preference set is for buying or renting." },
      maxPriceCents: { type: "integer" },
      currency: { type: "string", description: "3-letter currency code the customer discussed budget in, if different from the default (USD)." },
      minAreaSqm: { type: "number" },
      bedrooms: { type: "integer" },
      country: { type: "string", description: "Country the customer is searching in, if mentioned." },
      city: { type: "string", description: "City the customer is searching in, if mentioned." },
      districts: { type: "array", items: { type: "string" } },
      propertyType: { type: "string", enum: ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"] },
      furnished: { type: "boolean", description: "RENT only: whether the customer wants a furnished place." },
      moveInDate: { type: "string", description: "RENT only: ISO datetime the customer wants to move in." },
      leaseDurationMonths: { type: "integer", description: "RENT only: desired lease length in months." },
      hasPets: { type: "boolean", description: "RENT only: whether the customer has pets." },
      occupantCount: { type: "integer", description: "RENT only: number of occupants." },
      financingType: { type: "string", enum: ["CASH", "MORTGAGE"], description: "SALE only: how the customer plans to pay." },
      purchaseTimeframe: {
        type: "string",
        enum: ["IMMEDIATE", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "FLEXIBLE"],
        description: "SALE only: how soon the customer wants to close."
      }
    },
    required: ["type", "transactionType"],
    additionalProperties: false
  }
];

export const REAL_ESTATE_PROMPT_INSTRUCTIONS =
  "This business sells and rents real estate listings (properties). Always determine first whether the customer wants to BUY (SALE) or RENT a property - never assume, and pass that as transactionType on every searchProperties call and every UPDATE_BUYER_PREFERENCES action. Whenever the customer states a budget, always pass the 3-letter currency code alongside maxPriceCents on searchProperties (defaulting to this business's usual currency only if the customer didn't say and there's no other cue) - never assume two prices in different currencies are comparable just because the numbers look similar. Use searchProperties to find matching active listings before answering - never invent listings. If the customer mentions a specific country or city (this agency may operate in more than one), pass country/city on searchProperties and UPDATE_BUYER_PREFERENCES so results stay relevant. If the customer states what they're looking for (budget, area, bedrooms, location), propose UPDATE_BUYER_PREFERENCES to save it, including the currency they discussed if it differs from the default, even if you also found matching listings - for a RENT search also ask about move-in date, lease length, furnished preference, occupants, and pets when relevant; for a SALE search ask about financing (cash or mortgage) and purchase timeframe instead. If the customer wants to see a property in person, propose CREATE_VIEWING with the property's id and how many minutes from now to schedule it.";

export function buildRealEstateToolHandlers(prisma: PrismaClient, organizationId: string) {
  return {
    async searchProperties(input: unknown) {
      const parsed = SearchPropertiesInputSchema.parse(input);
      return prisma.property.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          transactionType: parsed.transactionType,
          // Price filtering is scoped to same-currency listings only - a
          // property priced in a different currency is excluded from a
          // budget-constrained search rather than compared numerically
          // (e.g. an AED 2,000,000 budget must never match a EUR-priced
          // listing just because the raw numbers happen to be close).
          ...(parsed.maxPriceCents != null ? { priceCents: { lte: parsed.maxPriceCents }, currency: parsed.currency } : {}),
          ...(parsed.minAreaSqm != null ? { areaSqm: { gte: parsed.minAreaSqm } } : {}),
          ...(parsed.bedrooms != null ? { bedrooms: { gte: parsed.bedrooms } } : {}),
          ...(parsed.country ? { country: parsed.country } : {}),
          ...(parsed.city ? { city: parsed.city } : {}),
          ...(parsed.districts?.length ? { district: { in: parsed.districts } } : {}),
          ...(parsed.propertyType ? { propertyType: parsed.propertyType } : {})
        },
        take: 5,
        select: {
          id: true,
          title: true,
          transactionType: true,
          priceCents: true,
          currency: true,
          rentBillingPeriod: true,
          bedrooms: true,
          areaSqm: true,
          country: true,
          district: true,
          city: true
        }
      });
    }
  };
}
