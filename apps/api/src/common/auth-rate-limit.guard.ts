import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { ApiEnv } from "@yoyo/config";
import { RateLimitedError } from "./domain-errors";
import { RateLimitService } from "./rate-limit.service";
import { API_ENV } from "./env.tokens";

/**
 * Applied to unauthenticated auth endpoints (login, signup, magic-link/reset requests)
 * to blunt brute-force/credential-stuffing attempts. Keyed by IP + route so one abusive
 * client can't exhaust the limit for everyone else.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimit: RateLimitService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `auth:${request.route?.path ?? request.path}:${request.ip}`;
    const { allowed } = await this.rateLimit.consume(
      key,
      this.env.RATE_LIMIT_AUTH_WINDOW_SECONDS,
      this.env.RATE_LIMIT_AUTH_MAX_ATTEMPTS
    );
    if (!allowed) {
      throw new RateLimitedError();
    }
    return true;
  }
}
