import { describe, expect, it } from "vitest";
import { runSalesAgent, type SalesAgentDeps, type ToolHandlers } from "../agent/sales-agent";
import { ALL_TOOLS } from "../tools/definitions";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "../types";

function usage(inputTokens = 10, outputTokens = 5): AICompletionResult["usage"] {
  return { inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

class ScriptedAIProvider implements AIProvider {
  private callIndex = 0;
  public readonly requests: AICompletionRequest[] = [];

  constructor(private readonly script: AICompletionResult[]) {}

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    // Snapshot messages - runSalesAgent mutates the same array across turns,
    // so without copying here every captured request would alias the final state.
    this.requests.push({ ...request, messages: [...request.messages] });
    const result = this.script[this.callIndex];
    this.callIndex++;
    if (!result) throw new Error("ScriptedAIProvider ran out of scripted responses");
    return result;
  }
}

const noopTools: ToolHandlers = {
  searchKnowledge: async () => ({}),
  findProduct: async () => ({}),
  getProductPrice: async () => ({}),
  findService: async () => ({}),
  getServicePrice: async () => ({}),
  getContactLeads: async () => ({}),
  getPipelineStages: async () => ({}),
  getTags: async () => ({}),
  getOpeningHours: async () => ({})
};

function deps(provider: AIProvider, tools: Partial<ToolHandlers> = {}): SalesAgentDeps {
  return { aiProvider: provider, tools: { ...noopTools, ...tools } };
}

describe("runSalesAgent", () => {
  it("calls a read tool then returns the structured reply from submit_reply", async () => {
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "searchKnowledge", input: { query: "opening hours" } }],
        usage: usage(100, 20)
      },
      {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "submit_reply",
            input: { reply: "We're open 9-5.", intent: "question", needsHuman: false, actions: [] }
          }
        ],
        usage: usage(150, 30)
      }
    ]);

    const result = await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "You are a helpful sales agent.",
      messages: [{ role: "user", content: [{ type: "text", text: "What are your hours?" }] }]
    });

    expect(result.reply).toEqual({ reply: "We're open 9-5.", intent: "question", needsHuman: false, actions: [] });
    expect(result.toolCallCount).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(provider.requests).toHaveLength(2);
  });

  it("feeds a tool error back to the model instead of crashing the loop", async () => {
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "findProduct", input: { name: "widget" } }],
        usage: usage()
      },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t2", name: "submit_reply", input: { reply: "Sorry, I couldn't find that.", intent: "other", needsHuman: true } }],
        usage: usage()
      }
    ]);

    const failingTools: Partial<ToolHandlers> = {
      findProduct: async () => {
        throw new Error("db unavailable");
      }
    };

    const result = await runSalesAgent(deps(provider, failingTools), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "Do you sell widgets?" }] }]
    });

    expect(result.reply?.needsHuman).toBe(true);
    const secondRequest = provider.requests[1];
    const lastMessage = secondRequest?.messages.at(-1);
    expect(lastMessage?.content[0]).toMatchObject({ type: "tool_result", isError: true, content: "db unavailable" });
  });

  it("returns reply: null when submit_reply is called with invalid arguments", async () => {
    const provider = new ScriptedAIProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "submit_reply", input: { reply: "" } }],
        usage: usage()
      }
    ]);

    const result = await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
    });

    expect(result.reply).toBeNull();
  });

  it("returns reply: null when the model produces only text with no tool call", async () => {
    const provider = new ScriptedAIProvider([{ stopReason: "end_turn", content: [{ type: "text", text: "thinking out loud" }], usage: usage() }]);

    const result = await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
    });

    expect(result.reply).toBeNull();
  });

  it("returns reply: null on a refusal stop reason without executing any tools", async () => {
    const provider = new ScriptedAIProvider([{ stopReason: "refusal", content: [], usage: usage() }]);

    const result = await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
    });

    expect(result.reply).toBeNull();
    expect(result.toolCallCount).toBe(0);
  });

  it("gives up after maxToolTurns rather than looping forever", async () => {
    const infiniteToolCall: AICompletionResult = {
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "loop", name: "getOpeningHours", input: {} }],
      usage: usage(1, 1)
    };
    const provider = new ScriptedAIProvider(Array(10).fill(infiniteToolCall));

    const result = await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      maxToolTurns: 3
    });

    expect(result.reply).toBeNull();
    expect(result.toolCallCount).toBe(3);
    expect(provider.requests).toHaveLength(3);
  });

  it("sends exactly ALL_TOOLS to the provider when no vertical extras are supplied", async () => {
    const provider = new ScriptedAIProvider([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "submit_reply", input: { reply: "hi", intent: "other", needsHuman: false } }], usage: usage() }
    ]);

    await runSalesAgent(deps(provider), {
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
    });

    expect(provider.requests[0]?.tools).toEqual(ALL_TOOLS);
  });

  it("calls a vertical extra tool and advertises its definition and extra action variants to the provider", async () => {
    const extraJsonVariant = { type: "object", properties: { type: { const: "CUSTOM_ACTION" } }, required: ["type"], additionalProperties: false };
    const provider = new ScriptedAIProvider([
      { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "searchProperties", input: { bedrooms: 2 } }], usage: usage() },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "t2", name: "submit_reply", input: { reply: "Found some!", intent: "other", needsHuman: false, actions: [] } }],
        usage: usage()
      }
    ]);

    const searchProperties = async (input: unknown) => ({ received: input });
    const result = await runSalesAgent(
      { ...deps(provider), extraTools: { searchProperties } },
      {
        model: "claude-sonnet-5",
        systemPrompt: "sys",
        messages: [{ role: "user", content: [{ type: "text", text: "2 bedroom apartment?" }] }],
        extraToolDefs: [{ name: "searchProperties", description: "Search listings.", inputSchema: { type: "object", properties: {} } }],
        extraActionVariants: [extraJsonVariant]
      }
    );

    expect(result.reply?.reply).toBe("Found some!");
    const firstRequestTools = provider.requests[0]?.tools ?? [];
    expect(firstRequestTools.map((t) => t.name)).toContain("searchProperties");
    const submitReplyTool = firstRequestTools.find((t) => t.name === "submit_reply");
    const { actions } = submitReplyTool?.inputSchema.properties as { actions: { items: { oneOf: unknown[] } } };
    expect(actions.items.oneOf).toContainEqual(extraJsonVariant);

    const secondMessage = provider.requests[1]?.messages.at(-1);
    expect(secondMessage?.content[0]).toMatchObject({ type: "tool_result", content: JSON.stringify({ received: { bedrooms: 2 } }) });
  });
});
