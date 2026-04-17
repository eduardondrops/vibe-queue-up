import { supabase } from "@/integrations/supabase/client";
import { scheduledDateFor } from "./scheduling";

export type QueueVideo = {
  id: string;
  workspace_id: string;
  video_url: string;
  storage_path: string;
  caption: string;
  base_text: string;
  hashtags: string;
  status: "pending" | "posted" | "skipped";
  queue_position: number | null;
  scheduled_at: string | null;
  posted_at: string | null;
  uploaded_by: string | null;
  created_at: string;
};

/**
 * Recompute queue_position and scheduled_at for all pending videos in a workspace.
 */
export async function recomputeQueue(workspaceId: string): Promise<void> {
  const { data, error } = await supabase
    .from("videos")
    .select("id, queue_position, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return;

  const updates = data.map((v, idx) => ({
    id: v.id,
    queue_position: idx,
    scheduled_at: scheduledDateFor(idx).toISOString(),
  }));

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("videos")
        .update({
          queue_position: u.queue_position,
          scheduled_at: u.scheduled_at,
        })
        .eq("id", u.id),
    ),
  );
}

/** Append a fresh upload to the END of the workspace's pending queue. */
export async function appendToQueue(payload: {
  workspaceId: string;
  storagePath: string;
  baseText: string;
  hashtags: string;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data: maxRow } = await supabase
    .from("videos")
    .select("queue_position")
    .eq("workspace_id", payload.workspaceId)
    .eq("status", "pending")
    .order("queue_position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const nextPos = (maxRow?.queue_position ?? -1) + 1;

  const { error } = await supabase.from("videos").insert({
    workspace_id: payload.workspaceId,
    video_url: payload.storagePath,
    storage_path: payload.storagePath,
    base_text: payload.baseText,
    caption: payload.baseText,
    hashtags: payload.hashtags,
    status: "pending",
    queue_position: nextPos,
    scheduled_at: scheduledDateFor(nextPos).toISOString(),
    uploaded_by: user.id,
  });

  if (error) throw error;

  await recomputeQueue(payload.workspaceId);
}

/** Mark as posted and stamp posted_at (used by auto-delete). */
export async function markPosted(id: string): Promise<void> {
  const { error } = await supabase
    .from("videos")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Skip: send to end of pending queue, recompute. */
export async function skipVideo(id: string, workspaceId: string): Promise<void> {
  const { data: maxRow } = await supabase
    .from("videos")
    .select("queue_position")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("queue_position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const tailPos = (maxRow?.queue_position ?? 0) + 1000;
  const { error } = await supabase
    .from("videos")
    .update({ queue_position: tailPos })
    .eq("id", id);
  if (error) throw error;

  await recomputeQueue(workspaceId);
}

/**
 * Auto-delete posted videos older than 48h within a workspace.
 * Removes both DB rows and storage objects.
 */
export async function autoDeleteOldPosted(workspaceId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("videos")
    .select("id, storage_path")
    .eq("workspace_id", workspaceId)
    .eq("status", "posted")
    .not("posted_at", "is", null)
    .lt("posted_at", cutoff);

  if (!stale || stale.length === 0) return 0;

  const paths = stale.map((s) => s.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from("videos").remove(paths);
  }
  const ids = stale.map((s) => s.id);
  await supabase.from("videos").delete().in("id", ids);
  return ids.length;
}
