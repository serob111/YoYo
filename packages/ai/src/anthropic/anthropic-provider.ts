import Anthropic from "@anthropic-ai/sdk";
import type { AICompletionRequest, AICompletionResult, AIContentBlock, AIMessage, AIProvider, AIStopReason } from "../types";

/**
 * Model is always a per-call parameter (AICompletionRequest.model), never
 * hardcoded here - BusinessProfile.defaultModel / AI_DEFAULT_MODEL supply it
 * upstream, so switching models never requires a code change.
 */
export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    // Prompt caching: the system prompt and tool definitions are near-identical
    // across turns of the same conversation (and across conversations for the
    // same org), so both are marked as cache breakpoints. A cache_control on the
    // last tool caches the entire tools array up to that point; a separate one on
    // the system block caches it too. Cached reads cost ~10% of the base input
    // rate - this is the highest-leverage cost lever that costs zero quality.
    const tools = request.tools?.map((tool, index, all) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
      ...(index === all.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {})
    }));

    const response = await this.client.messages.create({
      model: request.model,
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
      max_tokens: request.maxTokens,
      messages: request.messages.map(toAnthropicMessage),
      tools
    });

    return {
      stopReason: mapStopReason(response.stop_reason),
      content: response.content.map(fromAnthropicBlock).filter((block): block is AIContentBlock => block !== null),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0
      }
    };
  }
}

function toAnthropicMessage(message: AIMessage): Anthropic.Messages.MessageParam {
  return {
    role: message.role,
    content: message.content.map(toAnthropicBlockParam)
  };
}

function toAnthropicBlockParam(block: AIContentBlock): Anthropic.Messages.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return { type: "tool_result", tool_use_id: block.toolUseId, content: block.content, is_error: block.isError };
  }
}

function fromAnthropicBlock(block: Anthropic.Messages.ContentBlock): AIContentBlock | null {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "tool_use") return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  // Server tool blocks (web search, code execution, etc.) are never requested by
  // this agent, so anything else is dropped rather than crashing the loop.
  return null;
}

function mapStopReason(reason: Anthropic.Messages.StopReason | null): AIStopReason {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "other";
  }
}
