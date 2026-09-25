import { messageRows } from "./messages";
import { legalMessageRows } from "./legal-messages";

export const locales = ["hy", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "hy";
export const localeCookie = "yoyo_locale";
export const localeNames: Record<Locale, string> = { hy: "Հայերեն", ru: "Русский", en: "English" };
export const intlLocales: Record<Locale, string> = { hy: "hy-AM", ru: "ru-RU", en: "en-US" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function resolveLocale(cookie: string | undefined, acceptLanguage = ""): Locale {
  if (isLocale(cookie)) return cookie;
  const preferred = acceptLanguage.split(",").map((entry) => {
    const [language = "", quality] = entry.trim().split(";");
    return { language: language.toLowerCase().split("-")[0], quality: quality ? Number(quality.trim().replace(/^q=/, "")) : 1 };
  }).filter((entry) => entry.quality > 0).sort((first, second) => second.quality - first.quality);
  return preferred.find((entry) => isLocale(entry.language))?.language as Locale | undefined ?? defaultLocale;
}

const messages = new Map<string, Record<Locale, string>>();
for (const [en, ru, hy] of [...messageRows, ...legalMessageRows]) {
  const message = { en, ru, hy };
  messages.set(en, message);
  messages.set(ru, message);
}

const enumLabels: Record<string, string> = {
  AI_ACTIVE: "AI active", HUMAN_ACTIVE: "Human", PAUSED: "Paused", CLOSED: "Closed",
  BUYER: "Buyer", RENTER: "Renter", SELLER: "Seller", LANDLORD: "Landlord",
  SALE: "For sale", RENT: "For rent", ANY: "Any", ALL: "All",
  APARTMENT: "Apartment", HOUSE: "House", COMMERCIAL: "Commercial", LAND: "Land",
  DRAFT: "Draft", ACTIVE: "Active", UNDER_OFFER: "Under offer", SOLD: "Sold", RENTED: "Rented", ARCHIVED: "Archived",
  PRIVATE: "Private", ORGANIZATION_STOREFRONT: "Organization storefront", MARKETPLACE: "Marketplace (not available)",
  DAY: "Day", WEEK: "Week", MONTH: "Month", CASH: "Cash", MORTGAGE: "Mortgage",
  IMMEDIATE: "Immediate", WITHIN_3_MONTHS: "Within 3 months", WITHIN_6_MONTHS: "Within 6 months", FLEXIBLE: "Flexible",
  OWNER: "Owner", ADMIN: "Admin", AGENT: "Agent", PENDING: "Pending", FAILED: "Failed",
  OPEN: "Open", DONE: "Done", CANCELLED: "Cancelled", SCHEDULED: "Scheduled", COMPLETED: "Completed", NO_SHOW: "No show",
  CONNECTED: "Connected", ACTION_REQUIRED: "Action required", TOKEN_EXPIRED: "Token expired", ERROR: "Error", DISCONNECTED: "Disconnected",
  SEND_MESSAGE: "Send message", CREATE_TASK: "Create task", CREATE_FOLLOW_UP: "Schedule follow-up", ADD_TAG: "Add tag",
  LEAD_CREATED: "Lead created", LEAD_STAGE_CHANGED: "Lead stage changed", LISTING_MATCHED: "New listing matches a saved preference"
};

export function translate(locale: Locale, text: string): string {
  const key = enumLabels[text] ?? text;
  return messages.get(key)?.[locale] ?? text;
}
