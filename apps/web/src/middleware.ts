import { NextResponse, type NextRequest } from "next/server";

// Staging-only gate: active only when both env vars are set, so this is a
// no-op in local dev and in a future real-production deploy of the same
// codebase. Basic Auth here, not a login page, because it needs to block
// even reaching the dashboard's own login screen - unlike the API, which
// already requires a real session for everything except the 3 integration
// OAuth/webhook routes it deliberately leaves public.
const BASIC_AUTH_USER = process.env.STAGING_BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.STAGING_BASIC_AUTH_PASSWORD;

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Staging", charset="UTF-8"' }
  });
}

// Meta/TikTok app-review reviewers (and anyone else) need to fetch these
// without credentials - a Terms/Privacy URL that 401s isn't usable as an
// app-review URL.
const PUBLIC_PATHS = new Set(["/terms", "/privacy"]);

export function middleware(request: NextRequest): NextResponse {
  if (BASIC_AUTH_USER && BASIC_AUTH_PASSWORD && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Basic ")) return unauthorized();

    const decoded = atob(header.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const user = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    const password = separatorIndex === -1 ? "" : decoded.slice(separatorIndex + 1);
    if (user !== BASIC_AUTH_USER || password !== BASIC_AUTH_PASSWORD) return unauthorized();
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Everything except static assets/image optimization internals - those
  // don't need the auth check and excluding them keeps every real page load
  // to a single middleware pass instead of one per asset.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
