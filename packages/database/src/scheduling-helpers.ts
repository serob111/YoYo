import { DateTime } from "luxon";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface BusinessHoursWindow {
  open: string;
  close: string;
}
export type BusinessHours = Partial<Record<WeekdayKey, BusinessHoursWindow | null>>;

// luxon's .weekday is 1=Monday..7=Sunday.
const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isBusinessHours(value: unknown): value is BusinessHours {
  return typeof value === "object" && value !== null;
}

/**
 * Adjusts requestedAt forward to the next moment that falls within the
 * business's configured hours, evaluated in its own timezone. Fails open: an
 * unset/malformed businessHours value or an invalid IANA timezone returns
 * requestedAt unchanged rather than blocking a send over bad config. Used
 * once at follow-up creation time - never re-evaluated at dispatch.
 */
export function resolveNextSendTime(requestedAt: Date, timezone: string, businessHours: unknown): Date {
  if (!isBusinessHours(businessHours)) return requestedAt;

  const cursor = DateTime.fromJSDate(requestedAt, { zone: timezone });
  if (!cursor.isValid) return requestedAt;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const day = cursor.plus({ days: dayOffset });
    const dayKey = WEEKDAY_KEYS[day.weekday - 1];
    const window = dayKey ? businessHours[dayKey] : undefined;
    if (!window) continue;

    const openMinutes = parseTimeToMinutes(window.open);
    const closeMinutes = parseTimeToMinutes(window.close);
    if (openMinutes === null || closeMinutes === null) continue;

    const dayStart = day.startOf("day");
    const openTime = dayStart.plus({ minutes: openMinutes });
    const closeTime = dayStart.plus({ minutes: closeMinutes });

    if (dayOffset === 0) {
      if (cursor >= openTime && cursor < closeTime) return requestedAt;
      if (cursor < openTime) return openTime.toJSDate();
      continue; // already past closing today - try the next day
    }
    return openTime.toJSDate();
  }

  return requestedAt; // no open window found within a week - fail open
}
