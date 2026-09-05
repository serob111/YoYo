import { z } from "zod";

export const conversationAutomationStateSchema = z.enum(["AI_ACTIVE", "HUMAN_ACTIVE", "PAUSED", "CLOSED"]);

export const conversationSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  contactDisplayName: z.string(),
  connectedAccountId: z.string().uuid(),
  provider: z.literal("INSTAGRAM"),
  assignedUserId: z.string().uuid().nullable(),
  automationState: conversationAutomationStateSchema,
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type Conversation = z.infer<typeof conversationSchema>;

export const assignConversationSchema = z.object({
  assignedUserId: z.string().uuid().nullable()
});
export type AssignConversationInput = z.infer<typeof assignConversationSchema>;
