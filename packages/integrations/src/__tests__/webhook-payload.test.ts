import { describe, expect, it } from "vitest";
import { dedupeKeyFor, extractNormalizedInboundMessages, type InstagramWebhookPayload } from "../instagram/webhook-payload";

function textMessagePayload(overrides: Partial<{ mid: string; text: string; isEcho: boolean }> = {}): InstagramWebhookPayload {
  return {
    object: "instagram",
    entry: [
      {
        id: "17800000000000000",
        time: 1710000000000,
        messaging: [
          {
            sender: { id: overrides.isEcho ? "17800000000000000" : "1234567890" },
            recipient: { id: "17800000000000000" },
            timestamp: 1710000000000,
            message: {
              mid: overrides.mid ?? "mid.123456",
              text: overrides.text ?? "Hello!",
              is_echo: overrides.isEcho ?? false
            }
          }
        ]
      }
    ]
  };
}

describe("extractNormalizedInboundMessages", () => {
  it("normalizes a text message event", () => {
    const [event] = extractNormalizedInboundMessages(textMessagePayload());
    expect(event).toMatchObject({
      externalEventId: "mid.123456",
      connectedAccountExternalId: "17800000000000000",
      senderExternalId: "1234567890",
      messageType: "TEXT",
      text: "Hello!",
      isEcho: false
    });
  });

  it("flags echo events instead of dropping them", () => {
    const [event] = extractNormalizedInboundMessages(textMessagePayload({ isEcho: true }));
    expect(event?.isEcho).toBe(true);
  });

  it("skips non-message events (e.g. read receipts) entirely", () => {
    const payload: InstagramWebhookPayload = {
      object: "instagram",
      entry: [{ id: "1", time: 1, messaging: [{ sender: { id: "a" }, recipient: { id: "1" }, timestamp: 1 }] }]
    };
    expect(extractNormalizedInboundMessages(payload)).toHaveLength(0);
  });

  it("ignores payloads that aren't the instagram object", () => {
    const payload = { ...textMessagePayload(), object: "page" };
    expect(extractNormalizedInboundMessages(payload)).toHaveLength(0);
  });

  it("classifies an image attachment", () => {
    const payload: InstagramWebhookPayload = {
      object: "instagram",
      entry: [
        {
          id: "1",
          time: 1,
          messaging: [
            {
              sender: { id: "a" },
              recipient: { id: "1" },
              timestamp: 1,
              message: { mid: "mid.img", attachments: [{ type: "image", payload: { url: "https://example.com/x.jpg" } }] }
            }
          ]
        }
      ]
    };
    const [event] = extractNormalizedInboundMessages(payload);
    expect(event?.messageType).toBe("IMAGE");
    expect(event?.attachmentUrls).toEqual(["https://example.com/x.jpg"]);
  });
});

describe("dedupeKeyFor", () => {
  it("uses the message mid when present", () => {
    const entry = textMessagePayload().entry[0]!;
    const event = entry.messaging![0]!;
    expect(dedupeKeyFor(entry, event)).toBe("mid.123456");
  });

  it("is stable across repeated calls for the same event (retry safety)", () => {
    const entry = { id: "1", time: 1 };
    const event = { sender: { id: "a" }, recipient: { id: "1" }, timestamp: 1 };
    expect(dedupeKeyFor(entry, event)).toBe(dedupeKeyFor(entry, event));
  });
});
