export function parseSetCookies(setCookieHeader: string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const raw of setCookieHeader ?? []) {
    const [pair] = raw.split(";");
    const eqIndex = pair!.indexOf("=");
    const name = pair!.slice(0, eqIndex);
    const value = pair!.slice(eqIndex + 1);
    cookies[name] = value;
  }
  return cookies;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
