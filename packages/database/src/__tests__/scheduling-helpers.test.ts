import { describe, expect, it } from "vitest";
import { generateViewingSlots, resolveNextSendTime, type BusinessHours } from "../scheduling-helpers";

const NY = "America/New_York";
const WEEKDAY_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: null,
  sun: null
};

// September 2026: the 7th is a Monday, the 8th a Tuesday, the 5th a Saturday.
// New York is UTC-4 (EDT) throughout this range.
describe("resolveNextSendTime", () => {
  it("returns the requested time unchanged when already inside business hours", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 7, 14, 0)); // Mon 10:00 EDT
    expect(resolveNextSendTime(requestedAt, NY, WEEKDAY_HOURS)).toEqual(requestedAt);
  });

  it("pushes forward to opening time when requested before business hours the same day", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 7, 11, 0)); // Mon 07:00 EDT
    const expected = new Date(Date.UTC(2026, 8, 7, 13, 0)); // Mon 09:00 EDT
    expect(resolveNextSendTime(requestedAt, NY, WEEKDAY_HOURS)).toEqual(expected);
  });

  it("pushes forward to the next day's opening time when requested after business hours", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 8, 0, 0)); // Mon 20:00 EDT
    const expected = new Date(Date.UTC(2026, 8, 8, 13, 0)); // Tue 09:00 EDT
    expect(resolveNextSendTime(requestedAt, NY, WEEKDAY_HOURS)).toEqual(expected);
  });

  it("skips closed weekend days and lands on the next open weekday", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 5, 14, 0)); // Sat 10:00 EDT
    const expected = new Date(Date.UTC(2026, 8, 7, 13, 0)); // Mon 09:00 EDT
    expect(resolveNextSendTime(requestedAt, NY, WEEKDAY_HOURS)).toEqual(expected);
  });

  it("returns the requested time unchanged when businessHours is null", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 5, 3, 0)); // Sat 23:00 EDT (Fri night)
    expect(resolveNextSendTime(requestedAt, NY, null)).toEqual(requestedAt);
  });

  it("returns the requested time unchanged when businessHours is malformed", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 7, 11, 0));
    expect(resolveNextSendTime(requestedAt, NY, "not an object")).toEqual(requestedAt);
  });

  it("returns the requested time unchanged when the timezone is invalid", () => {
    const requestedAt = new Date(Date.UTC(2026, 8, 7, 11, 0));
    expect(resolveNextSendTime(requestedAt, "Not/A_Timezone", WEEKDAY_HOURS)).toEqual(requestedAt);
  });
});

describe("generateViewingSlots", () => {
  const now = new Date(Date.UTC(2026, 8, 7, 10, 0)); // Mon 06:00 EDT

  it("generates hourly slots across the configured window", () => {
    const slots = generateViewingSlots({
      date: "2026-09-07", // Monday, 09:00-18:00 EDT
      timezone: NY,
      businessHours: WEEKDAY_HOURS,
      slotMinutes: 60,
      now,
      bookedTimes: []
    });
    expect(slots).toHaveLength(9); // 09:00..17:00 start times
    expect(slots[0]).toEqual(new Date(Date.UTC(2026, 8, 7, 13, 0))); // 09:00 EDT
    expect(slots[slots.length - 1]).toEqual(new Date(Date.UTC(2026, 8, 7, 21, 0))); // 17:00 EDT
  });

  it("excludes slots already covered by a booked viewing", () => {
    const booked = [new Date(Date.UTC(2026, 8, 7, 15, 0))]; // 11:00 EDT
    const slots = generateViewingSlots({
      date: "2026-09-07",
      timezone: NY,
      businessHours: WEEKDAY_HOURS,
      slotMinutes: 60,
      now,
      bookedTimes: booked
    });
    expect(slots).not.toContainEqual(new Date(Date.UTC(2026, 8, 7, 15, 0)));
    expect(slots).toHaveLength(8);
  });

  it("excludes slots that have already passed", () => {
    const later = new Date(Date.UTC(2026, 8, 7, 17, 0)); // Mon 13:00 EDT
    const slots = generateViewingSlots({
      date: "2026-09-07",
      timezone: NY,
      businessHours: WEEKDAY_HOURS,
      slotMinutes: 60,
      now: later,
      bookedTimes: []
    });
    expect(slots.every((s) => s.getTime() > later.getTime())).toBe(true);
    expect(slots[0]).toEqual(new Date(Date.UTC(2026, 8, 7, 18, 0))); // 14:00 EDT
  });

  it("returns no slots on a day the business is closed", () => {
    const slots = generateViewingSlots({
      date: "2026-09-06", // Sunday
      timezone: NY,
      businessHours: WEEKDAY_HOURS,
      slotMinutes: 60,
      now,
      bookedTimes: []
    });
    expect(slots).toEqual([]);
  });

  it("falls back to default viewing hours when businessHours is unset", () => {
    const slots = generateViewingSlots({
      date: "2026-09-07",
      timezone: NY,
      businessHours: null,
      slotMinutes: 60,
      now,
      bookedTimes: []
    });
    expect(slots[0]).toEqual(new Date(Date.UTC(2026, 8, 7, 14, 0))); // default 10:00 EDT
  });

  it("falls back to UTC when the timezone is invalid", () => {
    const earlyNow = new Date(Date.UTC(2026, 8, 7, 5, 0)); // well before 09:00 UTC
    const slots = generateViewingSlots({
      date: "2026-09-07",
      timezone: "Not/A_Timezone",
      businessHours: WEEKDAY_HOURS,
      slotMinutes: 60,
      now: earlyNow,
      bookedTimes: []
    });
    expect(slots[0]).toEqual(new Date(Date.UTC(2026, 8, 7, 9, 0))); // 09:00 UTC
  });
});
