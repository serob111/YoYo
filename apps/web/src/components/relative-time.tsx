"use client";

import { useI18n } from "@/lib/i18n/provider";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60]
];

function formatRelative(date: Date, intlLocale: string, translateText: (text: string) => string): string {
  const formatter = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 45) return translateText("just now");
  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return formatter.format(Math.round(seconds / 60), "minute");
}

export function RelativeTime({ date }: { date: string | Date | null | undefined }) {
  const { t: translateText, locale, intlLocale } = useI18n();
  if (!date) return <span className="text-muted-foreground">—</span>;
  const parsed = typeof date === "string" ? new Date(date) : date;
  return (
    <time dateTime={parsed.toISOString()} title={parsed.toLocaleString(intlLocale)}>
      {formatRelative(parsed, intlLocale, translateText)}
    </time>
  );
}
