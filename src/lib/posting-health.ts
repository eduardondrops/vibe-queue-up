// Posting frequency health calculator.
// Combines past 7 active days (posted) and future 7 active days (scheduled).
// Active weekdays come from workspace_schedule.active_weekdays (0=Sun..6=Sat).

import { supabase } from "@/integrations/supabase/client";
import { getWorkspaceSchedule } from "./workspace-schedule";
import { TIMEZONE } from "./scheduling";

export type HealthStatus = "excellent" | "good" | "warning" | "idle";

export type PostingHealth = {
  status: HealthStatus;
  message: string;
  score: number; // 0..1
  postedLast7: number;
  expectedLast7: number;
  scheduledNext7: number;
  expectedNext7: number;
  daysSinceLastPost: number | null; // active days since last posted (null = never posted)
  activeWeekdays: number[];
  slotsPerDay: number;
  hasEverPosted: boolean;
  hasUpcoming: boolean;
};

/** Returns the SP weekday (0=Sun..6=Sat) for a Date. */
function spWeekday(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[fmt.format(d)] ?? 0;
}

/** Returns SP day key YYYY-MM-DD. */
function spDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Counts how many of the last `n` calendar days were active weekdays. */
function countActiveDaysInRange(
  fromDaysAgo: number,
  toDaysAgo: number,
  activeWeekdays: number[],
): { count: number; dayKeys: Set<string> } {
  const set = new Set<string>();
  let count = 0;
  const now = new Date();
  for (let i = fromDaysAgo; i >= toDaysAgo; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    if (activeWeekdays.includes(spWeekday(d))) {
      count++;
      set.add(spDayKey(d));
    }
  }
  return { count, dayKeys: set };
}

export async function getPostingHealth(workspaceId: string): Promise<PostingHealth> {
  const sched = await getWorkspaceSchedule(workspaceId);
  const activeWeekdays =
    sched.active_weekdays && sched.active_weekdays.length > 0
      ? sched.active_weekdays
      : [0, 1, 2, 3, 4, 5, 6];
  const slotsPerDay = sched.slots.length || 1;

  // Active day windows
  const past = countActiveDaysInRange(7, 1, activeWeekdays); // last 7 days excluding today
  const future = countActiveDaysInRange(-1, -7, activeWeekdays); // next 7 days starting tomorrow

  const expectedLast7 = past.count * slotsPerDay;
  const expectedNext7 = future.count * slotsPerDay;

  // Fetch posted in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

  const [postedRes, pendingRes, lastPostRes] = await Promise.all([
    supabase
      .from("videos")
      .select("posted_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "posted")
      .gte("posted_at", sevenDaysAgo.toISOString()),
    supabase
      .from("videos")
      .select("scheduled_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", new Date().toISOString())
      .lte("scheduled_at", sevenDaysFromNow.toISOString()),
    supabase
      .from("videos")
      .select("posted_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "posted")
      .not("posted_at", "is", null)
      .order("posted_at", { ascending: false })
      .limit(1),
  ]);

  // Count posts that fell on active days within the last 7 days
  let postedLast7 = 0;
  for (const row of postedRes.data ?? []) {
    if (!row.posted_at) continue;
    const k = spDayKey(new Date(row.posted_at));
    if (past.dayKeys.has(k)) postedLast7++;
  }

  // Count pending scheduled for active days in next 7 days
  let scheduledNext7 = 0;
  for (const row of pendingRes.data ?? []) {
    if (!row.scheduled_at) continue;
    const k = spDayKey(new Date(row.scheduled_at));
    if (future.dayKeys.has(k)) scheduledNext7++;
  }

  const pastRate = expectedLast7 > 0 ? Math.min(1, postedLast7 / expectedLast7) : 1;
  const futureRate = expectedNext7 > 0 ? Math.min(1, scheduledNext7 / expectedNext7) : 1;
  const score = pastRate * 0.6 + futureRate * 0.4;

  // Days since last post (counting only active weekdays)
  let daysSinceLastPost: number | null = null;
  const lastPostedAt = lastPostRes.data?.[0]?.posted_at;
  if (lastPostedAt) {
    const last = new Date(lastPostedAt);
    let count = 0;
    const now = new Date();
    const lastK = spDayKey(last);
    for (let i = 1; i <= 60; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const k = spDayKey(d);
      if (k === lastK || k < lastK) break;
      if (activeWeekdays.includes(spWeekday(d))) count++;
    }
    daysSinceLastPost = count;
  }

  // Classification
  let status: HealthStatus;
  let message: string;
  if (daysSinceLastPost !== null && daysSinceLastPost >= 2 && score < 0.85) {
    status = "warning";
    message = `Você está há ${daysSinceLastPost} dia${daysSinceLastPost === 1 ? "" : "s"} sem postar nesse perfil`;
  } else if (score >= 0.85) {
    status = "excellent";
    message = "Sua frequência de postagens está excelente";
  } else if (score >= 0.5) {
    status = "good";
    message = "Sua frequência de postagens está boa";
  } else {
    status = "warning";
    message =
      daysSinceLastPost !== null
        ? `Você está há ${daysSinceLastPost} dia${daysSinceLastPost === 1 ? "" : "s"} sem postar nesse perfil`
        : "Sua frequência de postagens está baixa";
  }

  return {
    status,
    message,
    score,
    postedLast7,
    expectedLast7,
    scheduledNext7,
    expectedNext7,
    daysSinceLastPost,
    activeWeekdays,
    slotsPerDay,
  };
}
