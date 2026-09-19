export function formatCents(cents: number | null, currency: string): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
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
  rentBillingPeriod: "DAY" | "WEEK" | "MONTH" | null
): string {
  const base = formatCents(cents, currency);
  if (transactionType !== "RENT" || cents == null) return base;
  return `${base}${rentBillingPeriod ? RENT_PERIOD_SUFFIX[rentBillingPeriod] : ""}`;
}
