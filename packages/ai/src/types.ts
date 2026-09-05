// AI provider abstraction, mirroring the capability-scoped interface pattern in
// @yoyo/integrations: small interfaces, a concrete Anthropic/Voyage adapter,
// nothing here assumes Prisma or any particular caller - see sales-agent.ts and
// docs/architecture/provider-abstraction.md.

export type AIRole = "user" | "assistant";

export type AIContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface AIMessage {
  role: AIRole;
  content: AIContentBlock[];
}

export interface AIToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AICompletionRequest {
  /** Never hardcoded by the provider implementation - always supplied by the caller. */
  model: string;
  system: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  maxTokens: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export type AIStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "stop_sequence" | "other";

export interface AICompletionResult {
  stopReason: AIStopReason;
  content: AIContentBlock[];
  usage: AIUsage;
}

export interface AIProvider {
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}

export type EmbeddingInputType = "query" | "document";

export interface EmbeddingResult {
  vectors: number[][];
  totalTokens: number;
}

export interface EmbeddingProvider {
  embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbeddingResult>;
}
