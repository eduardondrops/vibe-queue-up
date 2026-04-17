import { supabase } from "@/integrations/supabase/client";
import { scheduledDateFor } from "./scheduling";

export type QueueVideo = {
  id: string;
  video_url: string;
  storage_path: string;
  caption: string;
  hashtags: string;
  status: "pending" | "posted" | "skipped";
  queue_position: number | null;
  scheduled_at: string | null;
  created_at: string;
};

/**
 * Recompute queue_position and scheduled_at for ALL pending videos.
 * Pending videos are ordered by their current queue_position (nulls last),
 * then created_at as a tie-breaker.
 *
 * Posted/skipped videos are NOT touched (they keep their original schedule
 * for history; "skipped" is appended to the end of pending — see skipVideo).
 */
export async function recomputeQueue(): Promise<void> {
  const { data, error } = await supabase
    .from("videos")
    .select("id, queue_position, created_at")
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

  // Run updates in parallel — small lists.
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

/** Add a fresh upload to the END of the pending queue. */
export async function appendToQueue(payload: {
  videoUrl: string;
  storagePath: string;
  caption: string;
  hashtags: string;
}): Promise<void> {
  const { data: maxRow } = await supabase
    .from("videos")
    .select("queue_position")
    .eq("status", "pending")
    .order("queue_position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const nextPos = (maxRow?.queue_position ?? -1) + 1;

  const { error } = await supabase.from("videos").insert({
    video_url: payload.videoUrl,
    storage_path: payload.storagePath,
    caption: payload.caption,
    hashtags: payload.hashtags,
    status: "pending",
    queue_position: nextPos,
    scheduled_at: scheduledDateFor(nextPos).toISOString(),
  });

  if (error) throw error;

  // Recompute everyone so today's remaining slots fill first and
  // no schedule lands in the past.
  await recomputeQueue();
}

/** Mark as posted (does NOT shift the queue). */
export async function markPosted(id: string): Promise<void> {
  const { error } = await supabase
    .from("videos")
    .update({ status: "posted" })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Skip: remove from current position, send to END of pending queue,
 * recompute everyone's position + scheduled_at.
 */
export async function skipVideo(id: string): Promise<void> {
  const { data: maxRow } = await supabase
    .from("videos")
    .select("queue_position")
    .eq("status", "pending")
    .order("queue_position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const tailPos = (maxRow?.queue_position ?? 0) + 1000; // temp huge value
  const { error } = await supabase
    .from("videos")
    .update({ queue_position: tailPos })
    .eq("id", id);
  if (error) throw error;

  await recomputeQueue();
}
