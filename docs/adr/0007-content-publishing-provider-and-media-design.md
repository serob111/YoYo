# ADR-0007: Content publishing provider design, media pipeline, and their tradeoffs

## Status

Accepted (Phase 6).

## Context

Phase 6 adds content generation, an approval workflow, scheduling, and real publishing to Instagram and TikTok, plus a media (upload/storage) pipeline and optional AI photo enhancement. Several non-obvious design calls were made along the way; this ADR records them so they aren't silently re-litigated or assumed-away later.

## Decisions

### 1. `PublishingProvider` owns the whole create→poll→publish flow; no separate status method

`packages/integrations/src/types.ts`'s `PublishingProvider` interface has only `publishImage`/`publishVideo`/`publishCarousel` - no `getPublishStatus`. Both Instagram (container create → poll `status_code` → `media_publish`) and TikTok (`content/init` → upload/pull → poll `status/fetch`) are multi-step, asynchronous-on-the-provider-side flows. Rather than exposing that machinery to callers, each `publish*` method polls internally (bounded, ~30s) and returns only a final `PublishResult` or throws a classified `ProviderApiError`.

**Accepted tradeoff**: a retried publish (after a `RETRYABLE` failure) re-runs container/init creation from scratch rather than resuming the previous attempt's container/publish id. `ContentItem.providerContainerId`/`providerPostId` are recorded for debugging only. This is safe because both platforms auto-expire orphaned, never-published containers (~24h) and Instagram's 100-posts/24h quota only counts *published* media, not created-but-abandoned containers. If a future phase needs genuine crash-resumption (e.g. very large video uploads where restarting is expensive), this is the place to add it.

### 2. Instagram video uses `video_url`, not resumable binary upload to `rupload.facebook.com`

The Graph API supports both a URL-fetch flow (`video_url`, same public-reachability requirement as photos) and a resumable chunked binary upload flow. This phase uses `video_url` for both photos and videos uniformly, accepting that both need a publicly reachable media host - which local MinIO isn't. Implementing the resumable binary protocol would remove that limitation for video specifically, but is materially more complex and wasn't worth it before a public media host exists to test against anyway. Revisit if/when videos need to work without one.

### 3. `ImageEditProvider` is a new interface, not an extension of `AIProvider`

Image editing (Gemini) and text completion (Claude) are different media types from different provider families with no shared method shape - `AIProvider.complete()`'s request/response (messages, tool calls, token usage) doesn't fit an image-in/image-out call. A second small interface (`packages/ai/src/types.ts`) mirrors the existing "one interface per capability" convention (`AIProvider`, `EmbeddingProvider`, now `ImageEditProvider`) rather than overloading one interface with an unrelated shape.

### 4. Media upload is synchronous (presigned URLs); generation/enhancement is asynchronous (outbox + queue)

`MediaModule`'s presigned upload/download is a pure local cryptographic computation (no network call, no external API) - handled synchronously in `apps/api` with no queue involved. Caption generation and image enhancement are real external API calls (Claude, Gemini) that must survive an API-process crash between "claim" and "enqueue", so they go through the existing transactional outbox (`content.caption_generation_requested`, `content.image_enhancement_requested` outbox event types) exactly like every other must-not-be-lost async trigger in this codebase (Phase 2's `message.outbound_pending`, Phase 3's `message.inbound_received`). `ContentItem`/`ContentMediaAsset` are claimed (`GENERATING`/`ENHANCING`) in the same transaction as the outbox row.

### 5. Publishing itself is time-polled (`ContentDispatcherService`), not outbox-driven

Mirrors Phase 5's `FollowUp` vs `Automation` split: publishing is "fire at time X" (`ContentItem.scheduledFor`), not "react to a committed side effect," so it's a `FollowUpDispatcherService`-style 30s poller, not an outbox event. The atomic `APPROVED → PUBLISHING` claim in `apps/worker-publishing` (not the dispatcher) is what actually prevents duplicate publishing under concurrent dispatch - the dispatcher's deterministic `jobId` is only the first line of defense against a double-enqueue.

### 6. TikTok's forced-private-for-unaudited-apps restriction is a platform fact, not a bug

Until a TikTok app passes review, all content posted through it is restricted to private/self-only visibility. This is documented in `packages/integrations/src/tiktok/capabilities.ts` and surfaced via `ConnectedAccount.providerMetadata.visibilityRestricted` at connect time, rather than modeled as a `ProviderCapabilities` flag (there's no "can publish but only privately" boolean in that interface, and adding one would be a bigger change for a fact that's really about the *app*, not the *account's* capabilities).

### 7. TikTok photo/carousel publishing's exact upload mechanism is unverified

The Content Posting API's `FILE_UPLOAD` source is documented for video; whether photos support `FILE_UPLOAD` or only `PULL_FROM_URL` (a public-URL requirement, same limitation as Instagram photos) wasn't confirmed before implementation. `TikTokPublishingProvider.publishImage`/`publishCarousel` use `PULL_FROM_URL` and are explicitly commented as needing verification against TikTok's current docs before relying on them in production - this is the one path in the whole phase not proven end-to-end, even against a stub, and should be the first thing double-checked before a real TikTok photo post ships.

## Consequences

- Real, live proof of Instagram publishing (any post type) and TikTok photo/carousel publishing requires a publicly reachable media host - not available with local MinIO. These paths are proven via the `ScriptedPublishingProvider` unit-level tests in `apps/api/test/content-publish-worker.e2e-spec.ts` plus a local HTTP stub for request/response mechanics, not a genuine live call - the same treatment Phase 2 gave live webhook delivery.
- TikTok video publishing via `FILE_UPLOAD` is the one path that can be proven fully live locally (no public URL needed), and is the recommended manual smoke test.
- A future phase adding real crash-resumable publishing, TikTok binary photo upload (if it exists), or Instagram resumable video upload can do so without changing the `PublishingProvider` interface's public shape - these are internal implementation upgrades to existing methods.
