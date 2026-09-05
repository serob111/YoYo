import {
  AiReplySchema,
  ALL_TOOLS,
  FindProductInputSchema,
  FindServiceInputSchema,
  GetOpeningHoursInputSchema,
  GetProductPriceInputSchema,
  GetServicePriceInputSchema,
  SearchKnowledgeInputSchema,
  type AiReply
} from "../tools/definitions";
import type { AIContentBlock, AIMessage, AIProvider, AIUsage } from "../types";

const DEFAULT_MAX_TOOL_TURNS = 6;
const DEFAULT_MAX_TOKENS = 1024;

export interface ToolHandlers {
  searchKnowledge(input: { query: string }): Promise<unknown>;
  findProduct(input: { name: string }): Promise<unknown>;
  getProductPrice(input: { productId: string }): Promise<unknown>;
  findService(input: { name: string }): Promise<unknown>;
  getServicePrice(input: { serviceId: string }): Promise<unknown>;
  getOpeningHours(input: Record<string, never>): Promise<unknown>;
}

export interface SalesAgentDeps {
  aiProvider: AIProvider;
  tools: ToolHandlers;
}

export interface SalesAgentContext {
  model: string;
  systemPrompt: string;
  /** Conversation history as alternating turns, ending with the new inbound customer message as a "user" turn. */
  messages: AIMessage[];
  maxTokens?: number;
  maxToolTurns?: number;
}

export interface SalesAgentResult {
  /** Null when the agent never produced a valid structured reply (max turns exhausted, invalid submit_reply args, or a refusal) - callers must fall back to human handoff. */
  reply: AiReply | null;
  usage: AIUsage;
  toolCallCount: number;
}

function isToolUseBlock(block: AIContentBlock): block is Extract<AIContentBlock, { type: "tool_use" }> {
  return block.type === "tool_use";
}

function addUsage(a: AIUsage, b: AIUsage): AIUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens
  };
}

async function executeTool(tools: ToolHandlers, name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case "searchKnowledge":
      return tools.searchKnowledge(SearchKnowledgeInputSchema.parse(input));
    case "findProduct":
      return tools.findProduct(FindProductInputSchema.parse(input));
    case "getProductPrice":
      return tools.getProductPrice(GetProductPriceInputSchema.parse(input));
    case "findService":
      return tools.findService(FindServiceInputSchema.parse(input));
    case "getServicePrice":
      return tools.getServicePrice(GetServicePriceInputSchema.parse(input));
    case "getOpeningHours":
      return tools.getOpeningHours(GetOpeningHoursInputSchema.parse(input));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Manual tool-calling loop (not the SDK's beta Tool Runner - full control over
 * tenant-scoped tool execution and the submit_reply loop-exit condition matters
 * more here than the convenience of not hand-writing the loop). Capped at
 * maxToolTurns; if the model never calls submit_reply, returns reply: null so
 * the caller falls back to human handoff rather than looping forever.
 */
export async function runSalesAgent(deps: SalesAgentDeps, context: SalesAgentContext): Promise<SalesAgentResult> {
  const maxTurns = context.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS;
  const messages: AIMessage[] = [...context.messages];
  let usage: AIUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let toolCallCount = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await deps.aiProvider.complete({
      model: context.model,
      system: context.systemPrompt,
      messages,
      tools: ALL_TOOLS,
      maxTokens: context.maxTokens ?? DEFAULT_MAX_TOKENS
    });
    usage = addUsage(usage, result.usage);

    if (result.stopReason === "refusal") {
      return { reply: null, usage, toolCallCount };
    }

    messages.push({ role: "assistant", content: result.content });

    const toolUseBlocks = result.content.filter(isToolUseBlock);
    if (toolUseBlocks.length === 0) {
      // Model produced only text with no tool call (including no submit_reply) -
      // nothing more we can do deterministically; fall back to human.
      return { reply: null, usage, toolCallCount };
    }

    const submitBlock = toolUseBlocks.find((block) => block.name === "submit_reply");
    if (submitBlock) {
      const parsed = AiReplySchema.safeParse(submitBlock.input);
      return { reply: parsed.success ? parsed.data : null, usage, toolCallCount };
    }

    const toolResults: AIContentBlock[] = [];
    for (const block of toolUseBlocks) {
      toolCallCount++;
      try {
        const output = await executeTool(deps.tools, block.name, block.input);
        toolResults.push({ type: "tool_result", toolUseId: block.id, content: JSON.stringify(output) });
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          toolUseId: block.id,
          content: error instanceof Error ? error.message : String(error),
          isError: true
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: null, usage, toolCallCount };
}
