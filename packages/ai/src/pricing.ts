import type { AIUsage } from "./types";

// $ per 1M tokens, current as of the Anthropic pricing cached 2026-06-24.
// Update this table when pricing changes - there is no pricing API to read it from live.
const MODEL_PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 }
};

const DEFAULT_PRICING: { input: number; output: number } = { input: 3, output: 15 };

/** Cache-read tokens are billed at the input rate (Anthropic discounts them upstream in the token count itself). */
export function calculateCostCents(model: string, usage: AIUsage): number {
  const pricing = MODEL_PRICING_PER_MILLION_TOKENS[model] ?? DEFAULT_PRICING;
  const inputCost = ((usage.inputTokens + usage.cacheReadTokens) / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 100);
}
