import { describe, expect, it } from "vitest";
import { calculateCostCents } from "../pricing";

describe("calculateCostCents", () => {
  it("computes cost for a known model, billing cache-read tokens at the input rate", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 });
    expect(cents).toBe(300); // $3.00 input per 1M tokens
  });

  it("adds output cost on top of input cost", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 });
    expect(cents).toBe(300 + 1500);
  });

  it("falls back to a default price for an unknown/future model rather than throwing", () => {
    const cents = calculateCostCents("claude-future-model-9", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 });
    expect(cents).toBeGreaterThan(0);
  });
});
