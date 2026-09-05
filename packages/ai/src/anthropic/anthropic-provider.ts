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
    const response = await this.client.messages.create({
      model: request.model,
      system: request.system,
      max_tokens: request.maxTokens,
      messages: request.messages.map(toAnthropicMessage),
      tools: request.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema
      }))
    });

    return {
      stopReason: mapStopReason(response.stop_reason),
      content: response.content.map(fromAnthropicBlock).filter((block): block is AIContentBlock => block !== null),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0
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
