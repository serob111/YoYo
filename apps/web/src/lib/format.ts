import { defaultLocale, intlLocales, translate, type Locale } from "./i18n/config";

// cents arrives as a numeric string over the wire for Property/BuyerPreference
// fields (BigInt - see apps/api/src/main.ts's BigInt.prototype.toJSON; a real
// AMD-denominated property already exceeds a 32-bit int in cents), but still
// a plain number for smaller-value fields (Product/Service prices). Accepting
// both here keeps every existing call site working without a cast.
export function formatCents(cents: number | string | null, currency: string, locale: Locale = defaultLocale): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat(intlLocales[locale], { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(cents) / 100);
}

export function formatPropertyLocation(property: {
  address: string | null;
  district: string | null;
  city: string | null;
  country: string | null;
}): string {
  const parts = [property.address, property.district, property.city, property.country].filter(
    (part): part is string => !!part && part.trim() !== ""
  );
  return parts.length > 0 ? parts.join(", ") : "—";
}

const RENT_PERIOD_SUFFIX: Record<"DAY" | "WEEK" | "MONTH", string> = {
  DAY: "/day",
  WEEK: "/wk",
  MONTH: "/mo"
};

// A bare price on a rental listing is misleading, not just incomplete - a
// RENT property's priceCents always needs its billing period alongside it.
export function formatPrice(
  cents: number | string | null,
  currency: string,
  transactionType: "SALE" | "RENT",
  rentBillingPeriod: "DAY" | "WEEK" | "MONTH" | null,
  locale: Locale = defaultLocale
): string {
  const base = formatCents(cents, currency, locale);
  if (transactionType !== "RENT" || cents == null) return base;
  return `${base}${rentBillingPeriod ? translate(locale, RENT_PERIOD_SUFFIX[rentBillingPeriod]) : ""}`;
}
