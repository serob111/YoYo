import { defaultLocale, intlLocales, translate, type Locale } from "./i18n/config";

export function formatCents(cents: number | null, currency: string, locale: Locale = defaultLocale): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat(intlLocales[locale], { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const RENT_PERIOD_SUFFIX: Record<"DAY" | "WEEK" | "MONTH", string> = {
  DAY: "/day",
  WEEK: "/wk",
  MONTH: "/mo"
};

// A bare price on a rental listing is misleading, not just incomplete - a
// RENT property's priceCents always needs its billing period alongside it.
export function formatPrice(
  cents: number | null,
  currency: string,
  transactionType: "SALE" | "RENT",
  rentBillingPeriod: "DAY" | "WEEK" | "MONTH" | null,
  locale: Locale = defaultLocale
): string {
  const base = formatCents(cents, currency, locale);
  if (transactionType !== "RENT" || cents == null) return base;
  return `${base}${rentBillingPeriod ? translate(locale, RENT_PERIOD_SUFFIX[rentBillingPeriod]) : ""}`;
}
