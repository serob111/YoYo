import { Body, Controller, Get, HttpCode, Inject, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ApiEnv } from "@yoyo/config";
import type { InstagramWebhookPayload } from "@yoyo/integrations";
import { API_ENV } from "../common/env.tokens";
import { WebhookSignatureGuard } from "./webhook-signature.guard";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks/instagram")
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  // Meta's one-time subscription verification handshake. See
  // docs/architecture/overview.md's webhook flow and packages/integrations'
  // webhook-signature.ts for the POST-side signature check.
  @Get()
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() res: Response
  ) {
    if (mode === "subscribe" && verifyToken && this.env.META_WEBHOOK_VERIFY_TOKEN && verifyToken === this.env.META_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send("Verification failed");
  }

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async ingest(@Body() payload: InstagramWebhookPayload) {
    // Respond fast; all processing beyond dedupe+outbox happens in worker-webhooks.
    // See docs/architecture/overview.md: "verify -> validate -> persist -> dedupe
    // -> enqueue -> respond 2xx -> worker consumes."
    await this.webhooks.ingest(payload);
    return { status: "ok" };
  }
}
