import { createHash } from "node:crypto";

export interface InstagramWebhookAttachment {
  type: string;
  payload?: { url?: string };
}

export interface InstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: InstagramWebhookAttachment[];
  };
}

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging?: InstagramMessagingEvent[];
}

export interface InstagramWebhookPayload {
  object: string;
  entry: InstagramWebhookEntry[];
}

export type NormalizedMessageType = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "STICKER" | "UNKNOWN";

/**
 * Provider payloads never leak past this boundary - everything downstream
 * (worker-webhooks' normalization step) works with this shape, not raw Meta
 * JSON. See docs/architecture/provider-abstraction.md "Normalized events".
 */
export interface NormalizedInboundMessage {
  externalEventId: string;
  /** The connected account's own external id - resolves organizationId via ConnectedAccount lookup. */
  connectedAccountExternalId: string;
  senderExternalId: string;
  occurredAt: Date;
  messageType: NormalizedMessageType;
  text: string | null;
  attachmentUrls: string[];
  /** True if this is Meta echoing back a message our own system sent - must not be re-ingested as inbound. */
  isEcho: boolean;
}

function classifyAttachmentType(type: string): NormalizedMessageType {
  switch (type) {
    case "image":
      return "IMAGE";
    case "video":
      return "VIDEO";
    case "audio":
      return "AUDIO";
    case "file":
      return "DOCUMENT";
    default:
      return "UNKNOWN";
  }
}

export function dedupeKeyFor(entry: InstagramWebhookEntry, event: InstagramMessagingEvent): string {
  if (event.message?.mid) {
    return event.message.mid;
  }
  // Events without a natural id (rare for message webhooks) get a stable hash
  // of their content so retries of the exact same delivery still dedupe.
  return createHash("sha256").update(JSON.stringify({ entryId: entry.id, event })).digest("hex");
}

/**
 * Extracts every message-carrying event from a webhook payload. Echoes (Meta
 * confirming a message OUR system sent) are included but flagged via isEcho
 * so the caller can store+ignore them rather than silently dropping the
 * webhook delivery (every event still needs a ProviderWebhookEvent dedupe row).
 */
export function extractNormalizedInboundMessages(payload: InstagramWebhookPayload): NormalizedInboundMessage[] {
  const results: NormalizedInboundMessage[] = [];
  if (payload.object !== "instagram") {
    return results;
  }

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (!event.message) {
        continue; // not a message-carrying event (e.g. a read receipt) - out of scope for Phase 2
      }
      const attachments = event.message.attachments ?? [];
      const messageType: NormalizedMessageType = event.message.text
        ? "TEXT"
        : attachments.length > 0
          ? classifyAttachmentType(attachments[0]!.type)
          : "UNKNOWN";

      results.push({
        externalEventId: dedupeKeyFor(entry, event),
        connectedAccountExternalId: entry.id,
        senderExternalId: event.sender.id,
        occurredAt: new Date(event.timestamp),
        messageType,
        text: event.message.text ?? null,
        attachmentUrls: attachments.map((a) => a.payload?.url).filter((url): url is string => Boolean(url)),
        isEcho: event.message.is_echo === true
      });
    }
  }

  return results;
}
