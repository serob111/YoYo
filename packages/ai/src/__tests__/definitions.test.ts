import { describe, expect, it } from "vitest";
import { AiReplySchema, ALL_TOOLS, buildSubmitReplyTool } from "../tools/definitions";

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

  it("rejects an unknown action type", () => {
    expect(AiReplySchema.safeParse({ reply: "hi", intent: "question", needsHuman: false, actions: [{ type: "DELETE_EVERYTHING" }] }).success).toBe(false);
  });

  it("accepts a CREATE_LEAD action with a title", () => {
    const parsed = AiReplySchema.parse({
      reply: "Sure, I'll note that down.",
      intent: "booking",
      needsHuman: false,
      actions: [{ type: "CREATE_LEAD", title: "Wants a custom cake" }]
    });
    expect(parsed.actions).toEqual([{ type: "CREATE_LEAD", title: "Wants a custom cake" }]);
  });

  it("rejects a CREATE_LEAD action missing its title", () => {
    expect(AiReplySchema.safeParse({ reply: "hi", intent: "booking", needsHuman: false, actions: [{ type: "CREATE_LEAD" }] }).success).toBe(false);
  });

  it("accepts UPDATE_LEAD_STAGE and ADD_TAG actions with their required ids", () => {
    const parsed = AiReplySchema.parse({
      reply: "Great, updating your order.",
      intent: "other",
      needsHuman: false,
      actions: [
        { type: "UPDATE_LEAD_STAGE", leadId: "lead-1", stageId: "stage-1" },
        { type: "ADD_TAG", leadId: "lead-1", tagId: "tag-1" }
      ]
    });
    expect(parsed.actions).toHaveLength(2);
  });

  it("accepts a SCHEDULE_FOLLOW_UP action with and without an explicit leadId", () => {
    const withLead = AiReplySchema.safeParse({
      reply: "I'll follow up with you in 2 days!",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "SCHEDULE_FOLLOW_UP", leadId: "lead-1", delayMinutes: 2880, message: "Just checking in!" }]
    });
    expect(withLead.success).toBe(true);

    const withoutLead = AiReplySchema.safeParse({
      reply: "I'll follow up with you in 2 days!",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "SCHEDULE_FOLLOW_UP", delayMinutes: 2880, message: "Just checking in!" }]
    });
    expect(withoutLead.success).toBe(true);
  });

  it("rejects a SCHEDULE_FOLLOW_UP action beyond the 30-day cap", () => {
    const result = AiReplySchema.safeParse({
      reply: "hi",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "SCHEDULE_FOLLOW_UP", delayMinutes: 999_999, message: "too far out" }]
    });
    expect(result.success).toBe(false);
  });

  it("accepts a CREATE_VIEWING action with and without an explicit leadId", () => {
    const withLead = AiReplySchema.safeParse({
      reply: "I'll book a viewing.",
      intent: "booking",
      needsHuman: false,
      actions: [{ type: "CREATE_VIEWING", propertyId: "prop-1", leadId: "lead-1", delayMinutes: 1440 }]
    });
    expect(withLead.success).toBe(true);

    const withoutLead = AiReplySchema.safeParse({
      reply: "I'll book a viewing.",
      intent: "booking",
      needsHuman: false,
      actions: [{ type: "CREATE_VIEWING", propertyId: "prop-1", delayMinutes: 1440, notes: "Bring keys" }]
    });
    expect(withoutLead.success).toBe(true);
  });

  it("rejects a CREATE_VIEWING action missing its propertyId", () => {
    const result = AiReplySchema.safeParse({
      reply: "hi",
      intent: "booking",
      needsHuman: false,
      actions: [{ type: "CREATE_VIEWING", delayMinutes: 60 }]
    });
    expect(result.success).toBe(false);
  });

  it("accepts a partial UPDATE_BUYER_PREFERENCES action", () => {
    const result = AiReplySchema.safeParse({
      reply: "Noted your preferences.",
      intent: "other",
      needsHuman: false,
      actions: [
        { type: "UPDATE_BUYER_PREFERENCES", transactionType: "SALE", maxPriceCents: 18_000_000, bedrooms: 2, districts: ["Kentron", "Arabkir"] }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("accepts country and currency on an UPDATE_BUYER_PREFERENCES action", () => {
    const result = AiReplySchema.safeParse({
      reply: "Noted your preferences.",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "UPDATE_BUYER_PREFERENCES", transactionType: "RENT", country: "UAE", currency: "AED" }]
    });
    expect(result.success).toBe(true);
  });

  it("rejects an UPDATE_BUYER_PREFERENCES action missing transactionType", () => {
    const result = AiReplySchema.safeParse({
      reply: "hi",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "UPDATE_BUYER_PREFERENCES", maxPriceCents: 18_000_000 }]
    });
    expect(result.success).toBe(false);
  });

  it("rejects an UPDATE_BUYER_PREFERENCES action with a bad propertyType", () => {
    const result = AiReplySchema.safeParse({
      reply: "hi",
      intent: "other",
      needsHuman: false,
      actions: [{ type: "UPDATE_BUYER_PREFERENCES", transactionType: "SALE", propertyType: "SPACESHIP" }]
    });
    expect(result.success).toBe(false);
  });
});

describe("ALL_TOOLS", () => {
  it("includes every read tool plus the terminating submit_reply tool exactly once", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      "searchKnowledge",
      "findProduct",
      "getProductPrice",
      "findService",
      "getServicePrice",
      "getOpeningHours",
      "getContactLeads",
      "getPipelineStages",
      "getTags",
      "submit_reply"
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("buildSubmitReplyTool", () => {
  it("with no extra variants is identical to the tool ALL_TOOLS uses", () => {
    const tool = buildSubmitReplyTool();
    expect(tool).toEqual(ALL_TOOLS[ALL_TOOLS.length - 1]);
  });

  it("splices extra action variants into the actions.oneOf list without touching the core variants", () => {
    const extra = { type: "object", properties: { type: { const: "CUSTOM_ACTION" } }, required: ["type"], additionalProperties: false };
    const tool = buildSubmitReplyTool([extra]);
    const { actions } = tool.inputSchema.properties as { actions: { items: { oneOf: unknown[] } } };
    expect(actions.items.oneOf).toHaveLength(6);
    expect(actions.items.oneOf[5]).toEqual(extra);
  });
});
