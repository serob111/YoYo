import { describe, expect, it } from "vitest";
import { DEFAULT_VERTICAL_ID, VERTICAL_IDS, getVerticalConfig } from "../index";

describe("getVerticalConfig", () => {
  it("returns the core config for the default vertical id", () => {
    const config = getVerticalConfig(DEFAULT_VERTICAL_ID);
    expect(config.id).toBe("core");
    expect(config.navItems.map((item) => item.key)).toEqual([
      "dashboard",
      "inbox",
      "leads",
      "contacts",
      "members",
      "automations",
      "integrations",
      "vertical"
    ]);
  });

  it("falls back to core for null, undefined, and unknown vertical ids", () => {
    expect(getVerticalConfig(null).id).toBe("core");
    expect(getVerticalConfig(undefined).id).toBe("core");
    expect(getVerticalConfig("not_a_real_vertical").id).toBe("core");
  });

  it("returns the real_estate config for the real_estate vertical id, with core's nav plus Properties/Viewings", () => {
    const config = getVerticalConfig("real_estate");
    expect(config.id).toBe("real_estate");
    const coreItems = getVerticalConfig("core").navItems;
    expect(config.navItems.slice(0, coreItems.length)).toEqual(coreItems);
    expect(config.navItems.map((item) => item.key)).toEqual(expect.arrayContaining(["properties", "viewings"]));
  });
});

describe("VERTICAL_IDS", () => {
  it("matches every registered vertical config id", () => {
    for (const id of VERTICAL_IDS) {
      expect(getVerticalConfig(id).id).toBe(id);
    }
  });
});
