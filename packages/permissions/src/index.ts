export const ORGANIZATION_ROLES = ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const CAPABILITIES = [
  "manageBilling",
  "manageMembers",
  "manageIntegrations",
  "manageAI",
  "manageAutomations",
  "manageContent",
  "publishContent",
  "viewAnalytics",
  "manageCRM",
  "replyConversation",
  "takeOverConversation"
] as const;
export type Capability = (typeof CAPABILITIES)[number];

// Source of truth for role -> capability resolution. See docs/architecture/rbac.md.
const ROLE_CAPABILITIES: Record<OrganizationRole, ReadonlySet<Capability>> = {
  OWNER: new Set(CAPABILITIES),
  ADMIN: new Set(CAPABILITIES),
  MANAGER: new Set([
    "manageIntegrations",
    "manageAI",
    "manageAutomations",
    "manageContent",
    "publishContent",
    "viewAnalytics",
    "manageCRM",
    "replyConversation",
    "takeOverConversation"
  ]),
  AGENT: new Set(["viewAnalytics", "manageCRM", "replyConversation", "takeOverConversation"]),
  VIEWER: new Set(["viewAnalytics"])
};

export class PermissionsService {
  can(role: OrganizationRole, capability: Capability): boolean {
    return ROLE_CAPABILITIES[role].has(capability);
  }

  capabilitiesFor(role: OrganizationRole): Capability[] {
    return Array.from(ROLE_CAPABILITIES[role]);
  }
}

export const permissionsService = new PermissionsService();
