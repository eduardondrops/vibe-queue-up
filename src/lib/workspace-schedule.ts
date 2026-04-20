import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SLOT_STRINGS, parseSlots, type Slot } from "./scheduling";

export type WorkspaceSchedule = {
  workspace_id: string;
  slots: string[]; // "HH:MM"
  timezone: string;
  active_weekdays: number[]; // 0=Sun..6=Sat
};

const DEFAULT_ACTIVE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** In-memory cache so we don't refetch on every queue recompute. */
const cache = new Map<string, { value: WorkspaceSchedule; ts: number }>();
const CACHE_MS = 60_000;

export async function getWorkspaceSchedule(workspaceId: string): Promise<WorkspaceSchedule> {
  const cached = cache.get(workspaceId);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;

  const { data } = await supabase
    .from("workspace_schedule")
    .select("workspace_id, slots, timezone, active_weekdays")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const value: WorkspaceSchedule = {
    workspace_id: workspaceId,
    slots: data?.slots ?? DEFAULT_SLOT_STRINGS,
    timezone: data?.timezone ?? "America/Sao_Paulo",
    active_weekdays: data?.active_weekdays ?? DEFAULT_ACTIVE_WEEKDAYS,
  };
  cache.set(workspaceId, { value, ts: Date.now() });
  return value;
}

/** Owner-only: update active weekdays. */
export async function updateWorkspaceActiveWeekdays(
  workspaceId: string,
  activeWeekdays: number[],
): Promise<void> {
  const cleaned = Array.from(new Set(activeWeekdays.filter((d) => d >= 0 && d <= 6))).sort();
  const { error } = await supabase
    .from("workspace_schedule")
    .upsert(
      { workspace_id: workspaceId, active_weekdays: cleaned },
      { onConflict: "workspace_id" },
    );
  if (error) throw error;
  cache.delete(workspaceId);
}

export async function getWorkspaceSlots(workspaceId: string): Promise<Slot[]> {
  const sched = await getWorkspaceSchedule(workspaceId);
  return parseSlots(sched.slots);
}

/** Owner-only: update slots (and optionally active weekdays). */
export async function updateWorkspaceSlots(
  workspaceId: string,
  slots: string[],
  activeWeekdays?: number[],
): Promise<void> {
  const cleaned = parseSlots(slots).map((s) => s.label);
  if (cleaned.length === 0) throw new Error("Defina pelo menos um horário");

  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    slots: cleaned,
  };
  if (activeWeekdays) {
    const wd = Array.from(new Set(activeWeekdays.filter((d) => d >= 0 && d <= 6))).sort();
    if (wd.length === 0) throw new Error("Selecione pelo menos um dia da semana");
    payload.active_weekdays = wd;
  }

  const { error } = await supabase
    .from("workspace_schedule")
    .upsert(payload, { onConflict: "workspace_id" });
  if (error) throw error;
  cache.delete(workspaceId);
}

export function invalidateScheduleCache(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}
