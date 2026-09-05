import { describe, expect, it } from "vitest";
import { AiReplySchema, ALL_TOOLS } from "../tools/definitions";

describe("AiReplySchema", () => {
  it("accepts a minimal valid reply and defaults actions to an empty array", () => {
    const parsed = AiReplySchema.parse({ reply: "Hi there!", intent: "question", needsHuman: false });
    expect(parsed.actions).toEqual([]);
  });

  it("rejects an empty reply string", () => {
    expect(AiReplySchema.safeParse({ reply: "", intent: "question", needsHuman: false }).success).toBe(false);
  });

  it("rejects an unknown intent", () => {
    expect(AiReplySchema.safeParse({ reply: "hi", intent: "not_a_real_intent", needsHuman: false }).success).toBe(false);
  });

  it("rejects an action outside the Phase 3 scope (e.g. a CRM action not yet implemented)", () => {
    expect(AiReplySchema.safeParse({ reply: "hi", intent: "question", needsHuman: false, actions: ["CREATE_LEAD"] }).success).toBe(false);
  });
});

describe("ALL_TOOLS", () => {
  it("includes every read tool plus the terminating submit_reply tool exactly once", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(["searchKnowledge", "findProduct", "getProductPrice", "findService", "getServicePrice", "getOpeningHours", "submit_reply"]);
    expect(new Set(names).size).toBe(names.length);
  });
});
