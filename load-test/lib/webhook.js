// Shared by inbound-messages.js and spike-recovery.js - builds a realistically
// shaped, correctly HMAC-signed Instagram webhook POST body/headers pair
// against one of the 10 ConnectedAccounts seed-load-test.ts creates
// (externalAccountId = load_test_ig_<0-9>).
import crypto from "k6/crypto";

const SAMPLE_TEXTS = [
  "Hi! Is this still available?",
  "Do you have any 2-bedroom apartments in the center?",
  "What's the price range?",
  "Can I schedule a viewing this weekend?",
  "Is parking included?"
];

export function buildSignedWebhookRequest(metaAppSecret, orgCount, vu, iter) {
  const orgIndex = Math.floor(Math.random() * orgCount);
  const externalAccountId = `load_test_ig_${orgIndex}`;
  const uniqueSuffix = `${vu}-${iter}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

  const payload = {
    object: "instagram",
    entry: [
      {
        id: externalAccountId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: `load_test_sender_${uniqueSuffix}` },
            recipient: { id: externalAccountId },
            timestamp: Date.now(),
            message: {
              mid: `load_test_mid_${uniqueSuffix}`,
              text: SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)]
            }
          }
        ]
      }
    ]
  };

  // Sign the exact string being sent - the guard verifies HMAC over the raw
  // request body, so the signed string and the posted string must match byte-for-byte.
  const body = JSON.stringify(payload);
  const signature = crypto.hmac("sha256", metaAppSecret, body, "hex");

  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`
    }
  };
}
