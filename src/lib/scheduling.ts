// Pure helpers for queue scheduling.
// 3 vídeos por dia, slots fixos.
// timeSlot: 0 → 10:00, 1 → 18:30, 2 → 21:00.

export const SLOTS: Array<{ h: number; m: number; label: string }> = [
  { h: 10, m: 0, label: "10:00" },
  { h: 18, m: 30, label: "18:30" },
  { h: 21, m: 0, label: "21:00" },
];

export const VIDEOS_PER_DAY = SLOTS.length;

/** Returns slot index for a queue position. */
export function slotForIndex(index: number): number {
  return index % VIDEOS_PER_DAY;
}

/** Returns day offset (in days) from base date for a queue position. */
export function dayOffsetForIndex(index: number): number {
  return Math.floor(index / VIDEOS_PER_DAY);
}

/** Local-day midnight from a date (no UTC drift for "today"). */
export function startOfLocalDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Compute scheduled date for a position, anchored on a base day (defaults: today). */
export function scheduledDateFor(index: number, baseDay: Date = new Date()): Date {
  const day = startOfLocalDay(baseDay);
  day.setDate(day.getDate() + dayOffsetForIndex(index));
  const slot = SLOTS[slotForIndex(index)];
  day.setHours(slot.h, slot.m, 0, 0);
  return day;
}

/** Returns the time-slot label (e.g. "18:30") for a date. */
export function slotLabelForDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** YYYY-MM-DD key in local time. */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
