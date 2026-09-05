# Provider Abstraction (design only — implemented starting Phase 2)

This is designed now so that Phase 1's adjacent modeling (none yet — `ConnectedAccount` itself is a Phase 2 table) doesn't need to be reworked once real providers land. Nothing in this document is implemented in Phase 1.

## Capability-based, not one-size-fits-all

Different providers (Instagram, WhatsApp, TikTok, and future ones) support different subsets of functionality, and that subset depends on account type, granted scopes, and app approval status — not just on which provider it is. So capabilities are resolved dynamically per connected account, never assumed from the provider name alone.

```ts
interface ProviderCapabilities {
  oauth: boolean;
  inboundMessaging: boolean;
  outboundMessaging: boolean;
  mediaMessaging: boolean;
  comments: boolean;
  photoPublishing: boolean;
  videoPublishing: boolean;
  carouselPublishing: boolean;
  reelsPublishing: boolean;
  storyPublishing: boolean;
  draftUpload: boolean;
  analytics: boolean;
  webhooks: boolean;
}
```

## Small, capability-scoped interfaces — not one giant interface

```ts
interface SocialConnectionProvider {
  getAuthorizationUrl(state: string): string;
  exchangeAuthorizationCode(code: string): Promise<TokenSet>;
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
  revokeAccess(account: ConnectedAccount): Promise<void>;
  getAccountProfile(account: ConnectedAccount): Promise<ProviderProfile>;
  getCapabilities(account: ConnectedAccount): Promise<ProviderCapabilities>;
}

interface MessagingProvider {
  sendText(account: ConnectedAccount, to: string, text: string): Promise<ProviderSendResult>;
  sendMedia(account: ConnectedAccount, to: string, media: MediaRef): Promise<ProviderSendResult>;
  getMessageStatus(account: ConnectedAccount, providerMessageId: string): Promise<MessageStatus>;
}

interface PublishingProvider {
  publishImage(account: ConnectedAccount, asset: MediaAsset, caption: string): Promise<PublishResult>;
  publishVideo(account: ConnectedAccount, asset: MediaAsset, caption: string): Promise<PublishResult>;
  publishCarousel(account: ConnectedAccount, assets: MediaAsset[], caption: string): Promise<PublishResult>;
  uploadDraft(account: ConnectedAccount, asset: MediaAsset): Promise<DraftRef>;
  getPublishStatus(account: ConnectedAccount, externalId: string): Promise<PublishStatus>;
}
```

A provider adapter implements only the interfaces it actually supports. TikTok, for example, is not assumed to implement `MessagingProvider` — if TikTok messaging isn't available through the approved official API/app, the messaging feature is disabled for that connection rather than stubbed to fail silently or fake success.

## Normalized events at the boundary

Raw provider webhook/API payloads never leak past the integration layer. They're translated into normalized internal events (e.g. `InboundMessageReceived`) that the rest of the system consumes. Raw payloads may be persisted separately (`ProviderWebhookEvent`, Phase 2) for debugging/audit with a retention limit — they are not the shape core CRM/AI code works with.

## Official APIs only

Only officially supported provider APIs and auth mechanisms are used — no scraping, unofficial/private endpoints, or browser automation against social platforms. If a capability isn't available through an approved official API for a given account/app, the product disables that feature for that connection rather than faking it. Capability checks happen dynamically (scopes/approval status can change), not once at connection time.
