import "server-only";
import { cookies, headers } from "next/headers";
import { intlLocales, localeCookie, resolveLocale, translate } from "./config";

export function getI18n() {
  const locale = resolveLocale(cookies().get(localeCookie)?.value, headers().get("accept-language") ?? "");
  return { locale, intlLocale: intlLocales[locale], t: (text: string) => translate(locale, text) };
}
