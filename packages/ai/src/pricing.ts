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

// Standard Anthropic prompt-caching multipliers on the base input rate, for the
// default 5-minute-TTL ephemeral cache_control this codebase uses exclusively
// (see AnthropicProvider.complete). A 1-hour TTL, if ever used, is priced at 2x
// instead of 1.25x - not applicable here.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function calculateCostCents(model: string, usage: AIUsage): number {
  const pricing = MODEL_PRICING_PER_MILLION_TOKENS[model] ?? DEFAULT_PRICING;
  const regularInputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const cacheWriteCost = (usage.cacheCreationTokens / 1_000_000) * pricing.input * CACHE_WRITE_MULTIPLIER;
  const cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.input * CACHE_READ_MULTIPLIER;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round((regularInputCost + cacheWriteCost + cacheReadCost + outputCost) * 100);
}
