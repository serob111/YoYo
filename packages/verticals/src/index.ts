export interface VerticalNavItem {
  key: string;
  label: string;
  // Appended to `/dashboard/{organizationId}` to build the link href.
  path: string;
}

export interface VerticalConfig {
  id: string;
  label: string;
  navItems: VerticalNavItem[];
}

export const DEFAULT_VERTICAL_ID = "core";

// Single source of truth for which vertical ids are valid - used by
// packages/contracts to validate the "switch vertical" request. Keep this in
// sync with the VERTICALS map right below (both live in this one file).
export const VERTICAL_IDS = ["core", "real_estate"] as const;

// The only vertical implemented so far - mirrors today's hardcoded dashboard
// nav exactly, so switching the layout to read from this registry is a no-op
// for every existing organization. Future verticals (e.g. "real_estate") are
// added here as additional entries, not by branching call sites elsewhere.
// "Leads" and "Vertical" (settings) are Core - the CRM/leads backend and the
// vertical switcher itself apply to every organization, not just one vertical.
const CORE_VERTICAL: VerticalConfig = {
  id: DEFAULT_VERTICAL_ID,
  label: "YoYo",
  navItems: [
    { key: "dashboard", label: "Dashboard", path: "" },
    { key: "inbox", label: "Inbox", path: "/inbox" },
    { key: "leads", label: "Leads", path: "/leads" },
    { key: "contacts", label: "Contacts", path: "/contacts" },
    { key: "members", label: "Members", path: "/settings/members" },
    { key: "automations", label: "Automations", path: "/settings/automations" },
    { key: "integrations", label: "Integrations", path: "/settings/integrations" },
    { key: "vertical", label: "Vertical", path: "/settings/vertical" }
  ]
};

// Vertical Phase 3: registered so "real_estate" is a real, single-source-of-
// truth id (apps/worker-ai's AI tool wiring checks Organization.vertical ===
// "real_estate" directly) rather than a bare string known only to one call
// site. Vertical Phase 4: gained its own "Properties" nav entry. Vertical
// Phase 9: gained "Viewings" too - both are real-estate-only, layered on top
// of the same Core items every vertical gets.
const REAL_ESTATE_VERTICAL: VerticalConfig = {
  id: "real_estate",
  label: "YoYo",
  navItems: [
    ...CORE_VERTICAL.navItems,
    { key: "properties", label: "Properties", path: "/properties" },
    { key: "viewings", label: "Viewings", path: "/viewings" }
  ]
};

const VERTICALS: Record<string, VerticalConfig> = {
  [CORE_VERTICAL.id]: CORE_VERTICAL,
  [REAL_ESTATE_VERTICAL.id]: REAL_ESTATE_VERTICAL
};

// Falls back to the default vertical for null/undefined/unrecognized ids, so an
// organization with no vertical set - or one referencing a vertical that isn't
// registered (yet, or anymore) - still renders the current, generic experience
// instead of an empty nav.
export function getVerticalConfig(vertical: string | null | undefined): VerticalConfig {
  const match = vertical ? VERTICALS[vertical] : undefined;
  return match ?? CORE_VERTICAL;
}
