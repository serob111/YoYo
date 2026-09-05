import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { ApiEnv } from "@yoyo/config";
import { verifyInstagramWebhookSignature } from "@yoyo/integrations";
import { API_ENV } from "../common/env.tokens";
import { ProviderNotConfiguredError } from "../common/domain-errors";

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.META_APP_SECRET) {
      throw new ProviderNotConfiguredError("Instagram");
    }
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    return verifyInstagramWebhookSignature(request.rawBody ?? Buffer.from(""), signature, this.env.META_APP_SECRET);
  }
}
