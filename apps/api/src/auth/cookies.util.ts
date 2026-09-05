import type { Response } from "express";
import type { ApiEnv } from "@yoyo/config";
import { generateOpaqueToken } from "./token.util";

export function setSessionCookie(res: Response, env: ApiEnv, rawSessionToken: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    secure: env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res: Response, env: ApiEnv): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
  res.clearCookie(env.CSRF_COOKIE_NAME, { path: "/" });
}

export function setCsrfCookie(res: Response, env: ApiEnv): void {
  // Not HttpOnly: the frontend must be able to read this value in JS to echo it
  // back in the x-csrf-token header (double-submit pattern). See CsrfGuard.
  res.cookie(env.CSRF_COOKIE_NAME, generateOpaqueToken(), {
    httpOnly: false,
    secure: env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000
  });
}
