import { z } from "zod";
import { ORGANIZATION_ROLES } from "@yoyo/permissions";

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200)
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  createdAt: z.string().datetime(),
  myRole: z.enum(ORGANIZATION_ROLES)
});
export type Organization = z.infer<typeof organizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORGANIZATION_ROLES)
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1)
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const changeMemberRoleSchema = z.object({
  role: z.enum(ORGANIZATION_ROLES)
});
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

export const memberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(ORGANIZATION_ROLES),
  status: z.enum(["INVITED", "ACTIVE", "REMOVED"]),
  invitedAt: z.string().datetime(),
  joinedAt: z.string().datetime().nullable()
});
export type Member = z.infer<typeof memberSchema>;

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable()
  });
