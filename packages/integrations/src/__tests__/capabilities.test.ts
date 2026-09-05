import { describe, expect, it } from "vitest";
import { resolveInstagramCapabilities } from "../instagram/capabilities";

describe("resolveInstagramCapabilities", () => {
  it("grants messaging only to BUSINESS accounts with the messaging scope", () => {
    const caps = resolveInstagramCapabilities(["instagram_business_basic", "instagram_business_manage_messages"], "BUSINESS");
    expect(caps.inboundMessaging).toBe(true);
    expect(caps.outboundMessaging).toBe(true);
    expect(caps.webhooks).toBe(true);
  });

  it("denies messaging when the scope was not granted", () => {
    const caps = resolveInstagramCapabilities(["instagram_business_basic"], "BUSINESS");
    expect(caps.inboundMessaging).toBe(false);
    expect(caps.outboundMessaging).toBe(false);
  });

  it("denies messaging for a PERSONAL account even with the scope string present", () => {
    const caps = resolveInstagramCapabilities(["instagram_business_basic", "instagram_business_manage_messages"], "PERSONAL");
    expect(caps.inboundMessaging).toBe(false);
  });

  it("denies publishing without the content_publish scope", () => {
    const caps = resolveInstagramCapabilities(["instagram_business_basic", "instagram_business_manage_messages"], "BUSINESS");
    expect(caps.photoPublishing).toBe(false);
    expect(caps.reelsPublishing).toBe(false);
  });
});
