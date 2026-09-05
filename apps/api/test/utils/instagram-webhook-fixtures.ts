export function instagramTextWebhookPayload(params: {
  connectedAccountExternalId: string;
  senderId: string;
  mid: string;
  text: string;
  isEcho?: boolean;
}) {
  return {
    object: "instagram",
    entry: [
      {
        id: params.connectedAccountExternalId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: params.isEcho ? params.connectedAccountExternalId : params.senderId },
            recipient: { id: params.connectedAccountExternalId },
            timestamp: Date.now(),
            message: { mid: params.mid, text: params.text, is_echo: params.isEcho ?? false }
          }
        ]
      }
    ]
  };
}
