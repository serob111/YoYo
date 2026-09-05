import { describe, expect, it } from "vitest";
import { calculateCostCents } from "../pricing";

const noCache = { cacheReadTokens: 0, cacheCreationTokens: 0 };

describe("calculateCostCents", () => {
  it("computes cost for a known model at the base input rate", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 0, ...noCache });
    expect(cents).toBe(300); // $3.00 input per 1M tokens
  });

  it("adds output cost on top of input cost", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, ...noCache });
    expect(cents).toBe(300 + 1500);
  });

  it("bills cache-read tokens at ~10% of the base input rate", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 0 });
    expect(cents).toBe(30); // $3.00 * 0.1
  });

  it("bills cache-write tokens at ~125% of the base input rate", () => {
    const cents = calculateCostCents("claude-sonnet-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 1_000_000 });
    expect(cents).toBe(375); // $3.00 * 1.25
  });

  it("falls back to a default price for an unknown/future model rather than throwing", () => {
    const cents = calculateCostCents("claude-future-model-9", { inputTokens: 1_000_000, outputTokens: 0, ...noCache });
    expect(cents).toBeGreaterThan(0);
  });
});
