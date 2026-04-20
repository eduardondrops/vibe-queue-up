// Pure helpers for queue scheduling.
// Slots are configurable per workspace (array of "HH:MM" strings, in São Paulo TZ).
// Default fallback: 10:00, 18:30, 21:00.

export const TIMEZONE = "America/Sao_Paulo";

export type Slot = { h: number; m: number; label: string };

export const DEFAULT_SLOT_STRINGS = ["10:00", "18:30", "21:00"];

export const SLOTS: Slot[] = parseSlots(DEFAULT_SLOT_STRINGS);

/** Parse slot strings ("HH:MM") into Slot objects, sorted ascending. */
export function parseSlots(slotStrings: string[] | null | undefined): Slot[] {
  const list = (slotStrings && slotStrings.length > 0 ? slotStrings : DEFAULT_SLOT_STRINGS)
    .map((s) => {
      const [hStr, mStr] = s.split(":");
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return { h, m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    })
    .filter((x): x is Slot => x !== null);
  list.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  return list;
}

/**
 * Returns the current wall-clock time components in São Paulo timezone.
 */
function nowInSaoPaulo(): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/**
 * Returns the timezone offset in minutes for São Paulo at a given UTC instant.
 */
function spOffsetMinutes(utcDate: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (utcDate.getTime() - asUtc) / 60000;
}

/**
 * Build a Date (UTC instant) representing the given São Paulo wall-clock time.
 */
export function spWallToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = spOffsetMinutes(approx);
  return new Date(approx.getTime() + offset * 60000);
}

/** Add N days to a SP date (year/month/day). Handles month/year rollover. */
function spAddDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const anchor = spWallToUtc(year, month, day, 12, 0);
  const future = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(future);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/**
 * Returns the slots (UTC Date instants) that are still in the future today
 * relative to São Paulo current time, for a given slot list.
 */
export function getAvailableSlotsToday(slots: Slot[] = SLOTS): Date[] {
  const now = nowInSaoPaulo();
  const result: Date[] = [];
  for (const slot of slots) {
    if (slot.h > now.hour || (slot.h === now.hour && slot.m > now.minute)) {
      result.push(spWallToUtc(now.year, now.month, now.day, slot.h, slot.m));
    }
  }
  return result;
}

/**
 * Returns the slots (UTC Date instants) for a future SP date (yyyy-mm-dd).
 * If the date is today, returns only future slots.
 * If the date is in the past, returns [].
 */
export function getSlotsForDateKey(dateKey: string, slots: Slot[] = SLOTS): Date[] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const now = nowInSaoPaulo();
  const todayK = `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  if (dateKey < todayK) return [];
  if (dateKey === todayK) return getAvailableSlotsToday(slots);
  return slots.map((s) => spWallToUtc(y, m, d, s.h, s.m));
}

/**
 * Generate an upcoming list of slot timestamps starting from now (SP).
 */
export function generateUpcomingSlots(slots: Slot[] = SLOTS, maxDays = 365): Date[] {
  const out: Date[] = [];
  const now = nowInSaoPaulo();
  out.push(...getAvailableSlotsToday(slots));
  for (let i = 1; i <= maxDays; i++) {
    const next = spAddDays(now.year, now.month, now.day, i);
    for (const s of slots) {
      out.push(spWallToUtc(next.year, next.month, next.day, s.h, s.m));
    }
  }
  return out;
}

/** Returns the time-slot label (e.g. "18:30") for a date, in São Paulo time. */
export function slotLabelForDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** YYYY-MM-DD key in São Paulo time. */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's day key in SP. */
export function todayKey(): string {
  return dayKey(new Date());
}

/** Composite key for a specific slot instant (used as Set key). */
export function slotKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${dayKey(date)}T${slotLabelForDate(date)}`;
}
