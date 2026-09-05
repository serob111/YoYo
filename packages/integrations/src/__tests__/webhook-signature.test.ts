import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyInstagramWebhookSignature } from "../instagram/webhook-signature";

const secret = "test-app-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyInstagramWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    expect(verifyInstagramWebhookSignature(Buffer.from(body), sign(body), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const signature = sign(body);
    const tampered = body.replace("instagram", "tampered!");
    expect(verifyInstagramWebhookSignature(Buffer.from(tampered), signature, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyInstagramWebhookSignature(Buffer.from("{}"), undefined, secret)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = "{}";
    const wrongSignature = `sha256=${createHmac("sha256", "wrong-secret").update(body).digest("hex")}`;
    expect(verifyInstagramWebhookSignature(Buffer.from(body), wrongSignature, secret)).toBe(false);
  });

  it("rejects a malformed header without the sha256= prefix", () => {
    expect(verifyInstagramWebhookSignature(Buffer.from("{}"), "not-a-valid-signature", secret)).toBe(false);
  });
});
