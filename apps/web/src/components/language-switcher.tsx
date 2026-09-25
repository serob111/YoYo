"use client";

import { isLocale, localeNames, locales } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-border bg-background p-2 text-foreground shadow-md">
      <label className="flex items-center gap-2 text-sm">
        <span aria-hidden="true">◎</span>
        <span className="sr-only">{t("Language")}</span>
        <select
          className="max-w-36 cursor-pointer rounded-md bg-transparent px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          value={locale}
          onChange={(event) => isLocale(event.target.value) && setLocale(event.target.value)}
        >
          {locales.map((value) => <option key={value} value={value} lang={value}>{localeNames[value]}</option>)}
        </select>
      </label>
    </div>
  );
}
