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
    hour: get("hour") % 24, // some runtimes report 24 for midnight
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
function spWallToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // First approximation, then correct using the actual offset at that instant.
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = spOffsetMinutes(approx);
  return new Date(approx.getTime() + offset * 60000);
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
 * Compute the scheduled Date (UTC instant) for the Nth pending video (0-indexed).
 *
 * Rules:
 * - Fill remaining slots of TODAY (São Paulo) first.
 * - Then continue 3 per day at fixed slots on the following days.
 * - Never returns a date in the past.
 */
export function scheduledDateFor(index: number): Date {
  const today = getAvailableSlotsToday();

  if (index < today.length) {
    return today[index];
  }

  // Slots after today: continue from tomorrow (SP local), 3 per day.
  const remaining = index - today.length;
  const dayOffset = Math.floor(remaining / VIDEOS_PER_DAY) + 1; // +1 → tomorrow onward
  const slot = SLOTS[remaining % VIDEOS_PER_DAY];

  const now = nowInSaoPaulo();
  // Build SP wall-clock for now.day + dayOffset by leveraging UTC Date arithmetic.
  // We construct a date at noon SP today, then add dayOffset days, then read its SP wall date.
  const anchor = spWallToUtc(now.year, now.month, now.day, 12, 0);
  const future = new Date(anchor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(future);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return spWallToUtc(y, mo, d, slot.h, slot.m);
}

/**
 * Schedule a list of queue items (already ordered) and return their UTC dates.
 */
export function scheduleVideos<T>(queue: T[]): Array<{ item: T; scheduledAt: Date }> {
  return queue.map((item, idx) => ({ item, scheduledAt: scheduledDateFor(idx) }));
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
