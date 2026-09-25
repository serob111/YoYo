import { z } from "zod";
import type { AIProvider, AIToolDefinition } from "@yoyo/ai";

// Real-estate-specific AI knowledge for THIS worker only, mirroring the
// existing convention in apps/worker-ai/src/verticals/real-estate.ts of
// keeping vertical-specific AI logic out of the vertical-agnostic
// packages/ai. Apps can't import other apps in this monorepo, so this is a
// small, self-contained duplicate of that pattern rather than a new
// cross-app dependency.

// Only isPropertyRelated/confidence are `required` on the tool's JSON schema
// (see EXTRACTION_TOOL below) - every other field may be legitimately
// omitted by the model (not just explicit-null), most commonly on a
// non-property post where there's nothing to extract. .nullish() accepts
// both; .transform normalizes omitted -> null so ListingExtraction's type
// stays a plain `T | null` everywhere else (grouping.ts, process-sync.ts).
const nullish = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const ListingExtractionSchema = z.object({
  isPropertyRelated: z.boolean(),
  confidence: z.number().min(0).max(1),
  transactionType: nullish(z.enum(["SALE", "RENT"])),
  propertyType: nullish(z.enum(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"])),
  title: nullish(z.string()),
  description: nullish(z.string()),
  price: nullish(z.number().nonnegative()),
  currency: nullish(z.string().length(3)),
  bedrooms: nullish(z.number().int().nonnegative()),
  bathrooms: nullish(z.number().int().nonnegative()),
  areaSqm: nullish(z.number().positive()),
  country: nullish(z.string()),
  city: nullish(z.string()),
  district: nullish(z.string()),
  address: nullish(z.string()),
  externalListingReference: nullish(z.string()),
  availabilityHint: nullish(z.string()),
  signals: z.array(z.string()).default([])
});
export type ListingExtraction = z.infer<typeof ListingExtractionSchema>;

const EXTRACTION_TOOL: AIToolDefinition = {
  name: "submit_listing_extraction",
  description: "Submit the structured real-estate signals extracted from this social media post's caption and metadata.",
  inputSchema: {
    type: "object",
    properties: {
      isPropertyRelated: { type: "boolean", description: "True only if this post is advertising a specific real-estate listing (not a team photo, holiday post, market update, etc.)." },
      confidence: { type: "number", description: "0-1 confidence that isPropertyRelated is correct and the extracted fields are accurate." },
      transactionType: { type: ["string", "null"], enum: ["SALE", "RENT", null] },
      propertyType: { type: ["string", "null"], enum: ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND", null] },
      title: { type: ["string", "null"], description: "Short listing title, e.g. 'Dubai Marina Apartment'." },
      description: { type: ["string", "null"] },
      price: { type: ["number", "null"], description: "Numeric price/rent amount, not in cents." },
      currency: { type: ["string", "null"], description: "3-letter ISO currency code, e.g. AED, EUR, USD." },
      bedrooms: { type: ["integer", "null"] },
      bathrooms: { type: ["integer", "null"] },
      areaSqm: { type: ["number", "null"] },
      country: { type: ["string", "null"] },
      city: { type: ["string", "null"] },
      district: { type: ["string", "null"] },
      address: { type: ["string", "null"] },
      externalListingReference: { type: ["string", "null"], description: "A reference/listing ID mentioned in the caption, if any (strong grouping signal)." },
      availabilityHint: { type: ["string", "null"], description: "Any cue about whether this listing is still available, e.g. 'SOLD', 'just listed', or null if unclear." },
      signals: { type: "array", items: { type: "string" }, description: "Short phrases from the caption that support this extraction, for human review." }
    },
    required: ["isPropertyRelated", "confidence"],
    additionalProperties: false
  }
};

const SYSTEM_PROMPT =
  "You analyze a single Instagram post (caption + media type + posting date) from a real-estate agency's account and extract structured listing signals if it advertises a specific property. Non-property content (holiday greetings, team photos, market commentary, office content) must be marked isPropertyRelated: false with low confidence and null fields. Never invent a price, location, or bedroom count that isn't stated or strongly implied in the caption - leave the field null instead. You must end your turn by calling submit_listing_extraction exactly once.";

export interface ExtractionInput {
  caption: string | null;
  mediaType: string;
  postedAt: Date | null;
}

function isToolUseBlock(block: { type: string }): block is { type: "tool_use"; id: string; name: string; input: unknown } {
  return block.type === "tool_use";
}

export async function extractListingSignals(aiProvider: AIProvider, model: string, item: ExtractionInput): Promise<ListingExtraction | null> {
  const userText = [
    `Media type: ${item.mediaType}`,
    item.postedAt ? `Posted: ${item.postedAt.toISOString().slice(0, 10)}` : null,
    `Caption: ${item.caption?.trim() || "(no caption)"}`
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const result = await aiProvider.complete({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    tools: [EXTRACTION_TOOL],
    maxTokens: 1024
  });

  if (result.stopReason === "refusal") return null;

  const toolUse = result.content.filter(isToolUseBlock).find((block) => block.name === "submit_listing_extraction");
  if (!toolUse) return null;

  const parsed = ListingExtractionSchema.safeParse(toolUse.input);
  return parsed.success ? parsed.data : null;
}
