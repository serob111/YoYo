import type { MessagingProvider, ProviderSendResult, ConnectedAccountRef } from "../types";
import { DEFAULT_CONFIG, graphRequest, type InstagramHttpConfig } from "./http";

interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export class InstagramMessagingProvider implements MessagingProvider {
  private readonly config: Required<InstagramHttpConfig>;

  constructor(config: InstagramHttpConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async sendText(account: ConnectedAccountRef, recipientExternalId: string, text: string): Promise<ProviderSendResult> {
    const url = `${this.config.graphBaseUrl}/${this.config.graphApiVersion}/${account.externalAccountId}/messages`;
    const result = await graphRequest<SendMessageResponse>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.accessToken}`
      },
      body: JSON.stringify({
        recipient: { id: recipientExternalId },
        message: { text }
      })
    });
    return { providerMessageId: result.message_id };
  }
}
