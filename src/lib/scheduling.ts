// Pure helpers for queue scheduling.
// 3 vídeos por dia, slots fixos, sempre no fuso "America/Sao_Paulo".
// timeSlot: 0 → 10:00, 1 → 18:30, 2 → 21:00.

export const TIMEZONE = "America/Sao_Paulo";

export const SLOTS: Array<{ h: number; m: number; label: string }> = [
  { h: 10, m: 0, label: "10:00" },
  { h: 18, m: 30, label: "18:30" },
  { h: 21, m: 0, label: "21:00" },
];

export const VIDEOS_PER_DAY = SLOTS.length;

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
 * Positive value means timezone is behind UTC (SP is UTC-3 → returns 180).
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
  // Use UTC noon to avoid DST edge cases when adding days, then read back as SP wall.
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
 * relative to São Paulo current time.
 */
export function getAvailableSlotsToday(): Date[] {
  const now = nowInSaoPaulo();
  const result: Date[] = [];
  for (const slot of SLOTS) {
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
export function getSlotsForDateKey(dateKey: string): Date[] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const now = nowInSaoPaulo();
  const todayKey = `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  if (dateKey < todayKey) return [];
  if (dateKey === todayKey) return getAvailableSlotsToday();
  return SLOTS.map((s) => spWallToUtc(y, m, d, s.h, s.m));
}

/**
 * Generate an infinite-ish list of upcoming slot timestamps starting from now (SP).
 * `maxDays` bounds the horizon (default ~120 days = 360 slots).
 */
export function generateUpcomingSlots(maxDays = 120): Date[] {
  const out: Date[] = [];
  const now = nowInSaoPaulo();
  // Day 0 (today) — only future slots
  out.push(...getAvailableSlotsToday());
  // Day 1..maxDays — all 3 slots
  for (let i = 1; i <= maxDays; i++) {
    const next = spAddDays(now.year, now.month, now.day, i);
    for (const s of SLOTS) {
      out.push(spWallToUtc(next.year, next.month, next.day, s.h, s.m));
    }
  }
  return out;
}

/**
 * Compute the scheduled Date (UTC instant) for the Nth pending video (0-indexed)
 * if there were no pinned videos. Used for backwards compat / initial enqueue.
 */
export function scheduledDateFor(index: number): Date {
  const slots = generateUpcomingSlots();
  return slots[Math.min(index, slots.length - 1)];
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
