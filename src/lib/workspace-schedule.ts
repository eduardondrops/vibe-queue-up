import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SLOT_STRINGS, parseSlots, type Slot } from "./scheduling";

export type WorkspaceSchedule = {
  workspace_id: string;
  slots: string[]; // "HH:MM"
  timezone: string;
};

/** In-memory cache so we don't refetch on every queue recompute. */
const cache = new Map<string, { value: WorkspaceSchedule; ts: number }>();
const CACHE_MS = 60_000;

export async function getWorkspaceSchedule(workspaceId: string): Promise<WorkspaceSchedule> {
  const cached = cache.get(workspaceId);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;

  const { data } = await supabase
    .from("workspace_schedule")
    .select("workspace_id, slots, timezone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const value: WorkspaceSchedule = {
    workspace_id: workspaceId,
    slots: data?.slots ?? DEFAULT_SLOT_STRINGS,
    timezone: data?.timezone ?? "America/Sao_Paulo",
  };
  cache.set(workspaceId, { value, ts: Date.now() });
  return value;
}

export async function getWorkspaceSlots(workspaceId: string): Promise<Slot[]> {
  const sched = await getWorkspaceSchedule(workspaceId);
  return parseSlots(sched.slots);
}

/** Owner-only: update slots. Caller must validate permissions via RLS. */
export async function updateWorkspaceSlots(workspaceId: string, slots: string[]): Promise<void> {
  const cleaned = parseSlots(slots).map((s) => s.label);
  if (cleaned.length === 0) throw new Error("Defina pelo menos um horário");

  // Upsert (in case a workspace pre-dates the trigger or row was deleted).
  const { error } = await supabase
    .from("workspace_schedule")
    .upsert(
      { workspace_id: workspaceId, slots: cleaned },
      { onConflict: "workspace_id" },
    );
  if (error) throw error;
  cache.delete(workspaceId);
}

export function invalidateScheduleCache(workspaceId?: string) {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
}
