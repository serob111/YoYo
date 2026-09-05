import { z } from "zod";
import type { AIToolDefinition } from "../types";

// Read-only catalog/knowledge lookups the sales agent can call mid-conversation.
// Tenant scoping (organizationId) is enforced by the handler closures the
// caller supplies (see ToolHandlers in sales-agent.ts) - these definitions
// never carry an organizationId parameter, so the model can never smuggle one in.

export const SearchKnowledgeInputSchema = z.object({ query: z.string().min(1) });
export const FindProductInputSchema = z.object({ name: z.string().min(1) });
export const GetProductPriceInputSchema = z.object({ productId: z.string().min(1) });
export const FindServiceInputSchema = z.object({ name: z.string().min(1) });
export const GetServicePriceInputSchema = z.object({ serviceId: z.string().min(1) });
export const GetOpeningHoursInputSchema = z.object({});

// The terminating tool - calling this IS the structured final output, not a
// live side-effecting action. Using a tool instead of output_config.format
// keeps the loop-exit condition explicit and sidesteps any tool-use/structured-
// output interaction question.
export const AiReplySchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(["question", "pricing", "booking", "complaint", "other"]),
  needsHuman: z.boolean(),
  // Deliberately narrow: CRM (Phase 4) and Billing (Phase 7) don't exist yet, so
  // createLead/updateLeadStage/addTag are not offered as actions in this phase.
  actions: z.array(z.enum(["REQUEST_HUMAN_TAKEOVER"])).default([])
});
export type AiReply = z.infer<typeof AiReplySchema>;

export const READ_TOOLS: AIToolDefinition[] = [
  {
    name: "searchKnowledge",
    description: "Semantically search the business's knowledge base (FAQs, policies, manual notes) for information relevant to the customer's question.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "The customer's question or topic to search for." } },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "findProduct",
    description: "Look up products by name (partial match) to check if the business sells something matching the customer's request.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Product name or partial name to search for." } },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "getProductPrice",
    description: "Get the current price and availability of a specific product by its id (from a prior findProduct call).",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
      additionalProperties: false
    }
  },
  {
    name: "findService",
    description: "Look up services by name (partial match) to check if the business offers something matching the customer's request.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Service name or partial name to search for." } },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "getServicePrice",
    description: "Get the current price and duration of a specific service by its id (from a prior findService call).",
    inputSchema: {
      type: "object",
      properties: { serviceId: { type: "string" } },
      required: ["serviceId"],
      additionalProperties: false
    }
  },
  {
    name: "getOpeningHours",
    description: "Get the business's configured hours of operation and timezone.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];

export const SUBMIT_REPLY_TOOL: AIToolDefinition = {
  name: "submit_reply",
  description:
    "Call this exactly once, as your final action, to send your reply to the customer. Do not call this until you have gathered whatever information you need via the other tools.",
  inputSchema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "The message to send to the customer, in their language." },
      intent: { type: "string", enum: ["question", "pricing", "booking", "complaint", "other"] },
      needsHuman: { type: "boolean", description: "True if this conversation needs a human to take over instead of (or in addition to) your reply." },
      actions: {
        type: "array",
        items: { type: "string", enum: ["REQUEST_HUMAN_TAKEOVER"] },
        description: "Structured follow-up actions for the backend to execute. Leave empty if none apply."
      }
    },
    required: ["reply", "intent", "needsHuman"],
    additionalProperties: false
  }
};

export const ALL_TOOLS: AIToolDefinition[] = [...READ_TOOLS, SUBMIT_REPLY_TOOL];
