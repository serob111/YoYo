import { z } from "zod";

export const connectedAccountStatusSchema = z.enum(["CONNECTED", "ACTION_REQUIRED", "TOKEN_EXPIRED", "DISCONNECTED", "ERROR"]);

export const providerCapabilitiesSchema = z.object({
  oauth: z.boolean(),
  inboundMessaging: z.boolean(),
  outboundMessaging: z.boolean(),
  mediaMessaging: z.boolean(),
  comments: z.boolean(),
  photoPublishing: z.boolean(),
  videoPublishing: z.boolean(),
  carouselPublishing: z.boolean(),
  reelsPublishing: z.boolean(),
  storyPublishing: z.boolean(),
  draftUpload: z.boolean(),
  analytics: z.boolean(),
  webhooks: z.boolean()
});

export const connectedAccountSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal("INSTAGRAM"),
  status: connectedAccountStatusSchema,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  capabilities: providerCapabilitiesSchema,
  lastWebhookAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type ConnectedAccount = z.infer<typeof connectedAccountSchema>;
