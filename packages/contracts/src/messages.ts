import { z } from "zod";

export const messageDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export const messageSenderTypeSchema = z.enum(["CUSTOMER", "HUMAN", "SYSTEM", "AI", "AUTOMATION"]);
export const messageStatusSchema = z.enum(["PENDING", "QUEUED", "SENDING", "SENT", "DELIVERED", "READ", "FAILED"]);

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  direction: messageDirectionSchema,
  senderType: messageSenderTypeSchema,
  messageType: z.string(),
  text: z.string().nullable(),
  status: messageStatusSchema,
  providerTimestamp: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type Message = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(1000)
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
