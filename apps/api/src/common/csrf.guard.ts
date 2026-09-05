import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { ApiEnv } from "@yoyo/config";
import { API_ENV } from "./env.tokens";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Double-submit-cookie CSRF protection for cookie-authenticated, state-changing requests.
 * The CSRF cookie is not HttpOnly (the frontend JS must be able to read it and echo it
 * back in a header); a cross-origin attacker's page cannot read it due to same-origin
 * policy, so it can't forge the header even though the browser would still attach cookies.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const cookieToken = request.cookies?.[this.env.CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME];
    return typeof cookieToken === "string" && cookieToken.length > 0 && cookieToken === headerToken;
  }
}
