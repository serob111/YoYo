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
export const GetContactLeadsInputSchema = z.object({});
export const GetPipelineStagesInputSchema = z.object({});
export const GetTagsInputSchema = z.object({});

// Mutating CRM actions stay declarative (proposed here, validated once, then
// executed atomically by the backend) rather than live tool calls mid-loop -
// see ADR-0005. Referenced ids (leadId/stageId/tagId) are re-validated against
// the caller's organizationId before executing; a hallucinated/cross-tenant id
// is dropped silently rather than failing the whole reply.
export const AiActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("REQUEST_HUMAN_TAKEOVER") }),
  z.object({ type: z.literal("CREATE_LEAD"), title: z.string().min(1) }),
  z.object({ type: z.literal("UPDATE_LEAD_STAGE"), leadId: z.string().min(1), stageId: z.string().min(1) }),
  z.object({ type: z.literal("ADD_TAG"), leadId: z.string().min(1), tagId: z.string().min(1) })
]);
export type AiAction = z.infer<typeof AiActionSchema>;

// The terminating tool - calling this IS the structured final output, not a
// live side-effecting action. Using a tool instead of output_config.format
// keeps the loop-exit condition explicit and sidesteps any tool-use/structured-
// output interaction question.
export const AiReplySchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(["question", "pricing", "booking", "complaint", "other"]),
  needsHuman: z.boolean(),
  actions: z.array(AiActionSchema).default([])
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
  },
  {
    name: "getContactLeads",
    description: "List this customer's existing leads/deals (if any), with their current stage. Check this before proposing to create a new lead, to avoid creating a duplicate.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "getPipelineStages",
    description: "List the sales pipeline's stages (id, name, and whether each is a won/lost terminal stage), for use with the UPDATE_LEAD_STAGE action.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "getTags",
    description: "List the business's existing tags (id and name), for use with the ADD_TAG action. You may only use tags from this list - never invent a new tag name.",
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
        description: "Structured follow-up actions for the backend to execute. Leave empty if none apply.",
        items: {
          oneOf: [
            { type: "object", properties: { type: { const: "REQUEST_HUMAN_TAKEOVER" } }, required: ["type"], additionalProperties: false },
            {
              type: "object",
              properties: { type: { const: "CREATE_LEAD" }, title: { type: "string" } },
              required: ["type", "title"],
              additionalProperties: false
            },
            {
              type: "object",
              properties: { type: { const: "UPDATE_LEAD_STAGE" }, leadId: { type: "string" }, stageId: { type: "string" } },
              required: ["type", "leadId", "stageId"],
              additionalProperties: false
            },
            {
              type: "object",
              properties: { type: { const: "ADD_TAG" }, leadId: { type: "string" }, tagId: { type: "string" } },
              required: ["type", "leadId", "tagId"],
              additionalProperties: false
            }
          ]
        }
      }
    },
    required: ["reply", "intent", "needsHuman"],
    additionalProperties: false
  }
};

export const ALL_TOOLS: AIToolDefinition[] = [...READ_TOOLS, SUBMIT_REPLY_TOOL];
