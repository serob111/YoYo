import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { ApiEnv } from "@yoyo/config";
import { RateLimitedError } from "./domain-errors";
import { RateLimitService } from "./rate-limit.service";
import { API_ENV } from "./env.tokens";

/**
 * Applied to the public storefront's booking endpoint only (not the read
 * routes) - it's the one storefront route that writes data with no auth in
 * front of it, so it needs the same brute-force/spam blunting as auth. Keyed
 * by IP alone, not IP+route, since there's only ever one guarded route here.
 */
@Injectable()
export class StorefrontRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimit: RateLimitService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `storefront-booking:${request.ip}`;
    const { allowed } = await this.rateLimit.consume(key, this.env.RATE_LIMIT_STOREFRONT_WINDOW_SECONDS, this.env.RATE_LIMIT_STOREFRONT_MAX_ATTEMPTS);
    if (!allowed) {
      throw new RateLimitedError();
    }
    return true;
  }
}
