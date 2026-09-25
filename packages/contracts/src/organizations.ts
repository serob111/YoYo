import { z } from "zod";
import { ORGANIZATION_ROLES } from "@yoyo/permissions";
import { VERTICAL_IDS } from "@yoyo/verticals";

// vertical is optional and validated against the real registry (same as
// updateOrganizationVerticalSchema below) - omitted, it falls through to the
// Prisma column default ("core"). The real-estate onboarding route is the
// only caller that passes it explicitly; this keeps org creation generic
// rather than forcing every programmatic Organization creation down one vertical.
export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  vertical: z.enum(VERTICAL_IDS).optional()
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const setupStatusSchema = z.object({
  agencyCreated: z.boolean(),
  inventoryConfigured: z.boolean(),
  socialConnected: z.boolean(),
  firstLeadProcessed: z.boolean(),
  firstMatchReviewed: z.boolean(),
  complete: z.boolean()
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

// Unlike organizationSchema.vertical below (deliberately loose - reads should
// never reject on an org referencing an unregistered/legacy vertical id),
// writes are validated against the real registry so a bad value never lands
// in the database in the first place.
export const updateOrganizationVerticalSchema = z.object({
  vertical: z.enum(VERTICAL_IDS)
});
export type UpdateOrganizationVerticalInput = z.infer<typeof updateOrganizationVerticalSchema>;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  // Which packages/verticals config this org runs on (e.g. "core"). A plain
  // string, not a fixed enum, since the vertical registry grows in code, not
  // via a contract change - see packages/verticals's getVerticalConfig for the
  // fallback behavior for unrecognized values.
  vertical: z.string(),
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

export const dashboardStatsSchema = z.object({
  newLeadsThisWeek: z.number().int(),
  overdueFollowUps: z.number().int(),
  // Null when there are no closed (won or lost) leads yet - no rate to show.
  conversionRate: z.number().min(0).max(1).nullable(),
  aiHandledConversations: z.number().int(),
  humanHandledConversations: z.number().int()
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable()
  });
