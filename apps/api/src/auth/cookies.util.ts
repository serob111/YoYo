import type { CookieOptions, Response } from "express";
import type { ApiEnv } from "@yoyo/config";
import { generateOpaqueToken } from "./token.util";

// Outside development, web and api live on different hosts (different
// subdomains of a shared platform wildcard domain, or different hostnames
// entirely) - browsers always treat that as cross-site regardless of the
// parent domain, and SameSite=Lax cookies are never sent on cross-site
// fetch(). SameSite=None is required there, which in turn requires Secure
// (already true outside development). In development, web/api share
// `localhost` (different ports only, which is same-site), so Lax is correct
// and works without HTTPS.
function crossSiteCookieOptions(env: ApiEnv): Pick<CookieOptions, "secure" | "sameSite"> {
  const isDevelopment = env.NODE_ENV === "development";
  return { secure: !isDevelopment, sameSite: isDevelopment ? "lax" : "none" };
}

export function setSessionCookie(res: Response, env: ApiEnv, rawSessionToken: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    ...crossSiteCookieOptions(env),
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
    ...crossSiteCookieOptions(env),
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000
  });
}
