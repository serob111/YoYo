import type { AICompletionRequest, AICompletionResult, AIProvider, EmbeddingInputType, EmbeddingProvider, EmbeddingResult } from "../types";

// Load-testing only (see apps/worker-ai's AI_FAKE_LATENCY_MS wiring). Mimics a
// real provider's network latency via setTimeout, then returns a canned
// submit_reply tool call so runSalesAgent's loop-exit condition is met on the
// first turn - every downstream consumer (generateAiReply's parsing, DB
// writes, outbox event) runs exactly as it would for a real response, just
// with zero tokens spent and no network call.
export class FakeLatencyAIProvider implements AIProvider {
  constructor(private readonly delayMs: number) {}

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const submitReplyToolId = `fake_tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return {
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: submitReplyToolId,
          name: "submit_reply",
          input: {
            reply: "Thanks for reaching out! This is an automated load-test reply.",
            intent: "other",
            needsHuman: false,
            actions: []
          }
        }
      ],
      usage: {
        inputTokens: request.messages.length * 20,
        outputTokens: 40,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      }
    };
  }
}

const FAKE_EMBEDDING_DIMENSION = 1024;

export class FakeLatencyEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly delayMs: number) {}

  async embed(texts: string[], _inputType: EmbeddingInputType): Promise<EmbeddingResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    return {
      vectors: texts.map(() => new Array<number>(FAKE_EMBEDDING_DIMENSION).fill(0)),
      totalTokens: texts.reduce((sum, text) => sum + text.length, 0)
    };
  }
}
