import { describe, expect, it } from "vitest";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "@yoyo/ai";
import { ListingExtractionSchema, extractListingSignals } from "../listing-extraction";

const VALID_EXTRACTION = {
  isPropertyRelated: true,
  confidence: 0.9,
  transactionType: "SALE",
  propertyType: "APARTMENT",
  title: "Dubai Marina Apartment",
  description: null,
  price: 1850000,
  currency: "AED",
  bedrooms: 3,
  bathrooms: null,
  areaSqm: null,
  country: null,
  city: "Dubai",
  district: "Dubai Marina",
  address: null,
  externalListingReference: "DM-1029",
  availabilityHint: null,
  signals: ["AED 1,850,000", "3BR"]
};

describe("ListingExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(ListingExtractionSchema.safeParse(VALID_EXTRACTION).success).toBe(true);
  });

  it("rejects a confidence outside 0-1", () => {
    expect(ListingExtractionSchema.safeParse({ ...VALID_EXTRACTION, confidence: 1.5 }).success).toBe(false);
  });

  it("rejects an invalid transactionType", () => {
    expect(ListingExtractionSchema.safeParse({ ...VALID_EXTRACTION, transactionType: "LEASE" }).success).toBe(false);
  });

  it("requires only isPropertyRelated/confidence to be present - a non-property post is valid with everything else null", () => {
    const sparse = { isPropertyRelated: false, confidence: 0.1, transactionType: null, propertyType: null, title: null, description: null, price: null, currency: null, bedrooms: null, bathrooms: null, areaSqm: null, country: null, city: null, district: null, address: null, externalListingReference: null, availabilityHint: null, signals: [] };
    expect(ListingExtractionSchema.safeParse(sparse).success).toBe(true);
  });
});

class FakeAIProvider implements AIProvider {
  constructor(private readonly response: AICompletionResult) {}
  async complete(_request: AICompletionRequest): Promise<AICompletionResult> {
    return this.response;
  }
}

describe("extractListingSignals", () => {
  it("parses a valid submit_listing_extraction tool call into a ListingExtraction", async () => {
    const provider = new FakeAIProvider({
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "submit_listing_extraction", input: VALID_EXTRACTION }],
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
    });
    const result = await extractListingSignals(provider, "claude-sonnet-5", { caption: "3BR in Dubai Marina", mediaType: "REEL", postedAt: new Date() });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Dubai Marina Apartment");
  });

  it("returns null when the model refuses", async () => {
    const provider = new FakeAIProvider({ stopReason: "refusal", content: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });
    const result = await extractListingSignals(provider, "claude-sonnet-5", { caption: null, mediaType: "IMAGE", postedAt: null });
    expect(result).toBeNull();
  });

  it("returns null when the tool_use input fails schema validation", async () => {
    const provider = new FakeAIProvider({
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "submit_listing_extraction", input: { isPropertyRelated: true, confidence: "high" } }],
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 }
    });
    const result = await extractListingSignals(provider, "claude-sonnet-5", { caption: "test", mediaType: "IMAGE", postedAt: null });
    expect(result).toBeNull();
  });
});
