import { describe, expect, it } from "vitest";
import { permissionsService } from "../index";

describe("PermissionsService", () => {
  it("grants OWNER every capability", () => {
    for (const capability of permissionsService.capabilitiesFor("OWNER")) {
      expect(permissionsService.can("OWNER", capability)).toBe(true);
    }
    expect(permissionsService.capabilitiesFor("OWNER").length).toBeGreaterThan(0);
  });

  it("denies VIEWER any mutating capability", () => {
    expect(permissionsService.can("VIEWER", "manageMembers")).toBe(false);
    expect(permissionsService.can("VIEWER", "manageBilling")).toBe(false);
    expect(permissionsService.can("VIEWER", "replyConversation")).toBe(false);
  });

  it("only OWNER and ADMIN can manage members or billing", () => {
    expect(permissionsService.can("OWNER", "manageMembers")).toBe(true);
    expect(permissionsService.can("ADMIN", "manageMembers")).toBe(true);
    expect(permissionsService.can("MANAGER", "manageMembers")).toBe(false);
    expect(permissionsService.can("AGENT", "manageMembers")).toBe(false);
  });

  it("AGENT can reply and take over conversations but not manage content", () => {
    expect(permissionsService.can("AGENT", "replyConversation")).toBe(true);
    expect(permissionsService.can("AGENT", "takeOverConversation")).toBe(true);
    expect(permissionsService.can("AGENT", "manageContent")).toBe(false);
  });

  it("every role can view analytics", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"] as const) {
      expect(permissionsService.can(role, "viewAnalytics")).toBe(true);
    }
  });
});
