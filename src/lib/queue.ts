import { supabase } from "@/integrations/supabase/client";
import { generateUpcomingSlots, getSlotsForDateKey, slotKey } from "./scheduling";
import { getWorkspaceSlots } from "./workspace-schedule";

export type QueueVideo = {
  id: string;
  workspace_id: string;
  video_url: string;
  storage_path: string;
  caption: string;
  base_text: string;
  hashtags: string;
  yt_title: string;
  yt_description: string;
  status: "pending" | "posted" | "skipped";
  queue_position: number | null;
  scheduled_at: string | null;
  posted_at: string | null;
  uploaded_by: string | null;
  pinned: boolean;
  created_at: string;
};

type PendingRow = {
  id: string;
  scheduled_at: string | null;
  pinned: boolean;
  created_at: string;
};

/**
 * Recompute scheduled_at and queue_position for all pending videos in a workspace,
 * respecting pinned videos (which keep their slot).
 *
 * Algorithm:
 * 1. Load all pending rows with their current scheduled_at + pinned flag.
 * 2. Generate the upcoming slot timeline (SP, 3 per day, future only).
 * 3. Reserve slots used by pinned videos.
 * 4. Sort the non-pinned by their previous scheduled_at (then created_at).
 * 5. Assign each non-pinned video to the next free upcoming slot.
 * 6. Persist updates only for rows whose scheduled_at or queue_position changed.
 */
export async function recomputeQueue(workspaceId: string): Promise<void> {
  const { data, error } = await supabase
    .from("videos")
    .select("id, scheduled_at, pinned, created_at, queue_position")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");

  if (error) throw error;
  const rows = (data ?? []) as Array<PendingRow & { queue_position: number | null }>;
  if (rows.length === 0) return;

  const wsSlots = await getWorkspaceSlots(workspaceId);
  const upcoming = generateUpcomingSlots(wsSlots);
  const validSlotKeys = new Set(upcoming.map((d) => slotKey(d)));
  const reserved = new Set<string>();

  // A pinned video is only honored if its slot still matches a configured slot
  // AND is in the future. Otherwise it becomes floating (orphan after schedule
  // changes / past slot that never got posted).
  const pinnedHonored: typeof rows = [];
  const orphans: typeof rows = [];
  for (const r of rows) {
    if (!r.scheduled_at) {
      if (!r.pinned) orphans.push(r);
      continue;
    }
    const k = slotKey(r.scheduled_at);
    const isFuture = new Date(r.scheduled_at).getTime() > Date.now();
    if (r.pinned && validSlotKeys.has(k) && isFuture) {
      pinnedHonored.push(r);
      reserved.add(k);
    } else if (!r.pinned && validSlotKeys.has(k) && isFuture) {
      // Floating but already on a valid future slot — keep its order via scheduled_at.
      orphans.push(r);
    } else {
      // Orphan: invalid slot (schedule changed, or in the past).
      orphans.push(r);
    }
  }

  // Sort orphans/floating chronologically (past-scheduled first, then by created_at).
  const floating = orphans.sort((a, b) => {
      const sa = a.scheduled_at ?? a.created_at;
      const sb = b.scheduled_at ?? b.created_at;
      if (sa === sb) return a.created_at.localeCompare(b.created_at);
      return sa.localeCompare(sb);
    });
  const pinned = pinnedHonored;

  const assignments = new Map<string, { scheduled_at: string; queue_position: number }>();
  let cursor = 0;

  // Pinned ones keep their slot.
  for (const p of pinned) {
    if (!p.scheduled_at) continue;
    assignments.set(p.id, {
      scheduled_at: p.scheduled_at,
      queue_position: 0, // will be re-numbered below
    });
  }

  // Assign floating to next free slot.
  for (const f of floating) {
    while (cursor < upcoming.length && reserved.has(slotKey(upcoming[cursor]))) {
      cursor++;
    }
    if (cursor >= upcoming.length) break; // out of horizon
    const slot = upcoming[cursor];
    reserved.add(slotKey(slot));
    assignments.set(f.id, {
      scheduled_at: slot.toISOString(),
      queue_position: 0,
    });
    cursor++;
  }

  // Re-number queue_position by chronological scheduled_at.
  const ordered = Array.from(assignments.entries()).sort((a, b) =>
    a[1].scheduled_at.localeCompare(b[1].scheduled_at),
  );
  ordered.forEach(([id, val], idx) => {
    val.queue_position = idx;
    assignments.set(id, val);
  });

  // Persist only changed rows.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const honoredPinnedIds = new Set(pinned.map((p) => p.id));
  const updates: Array<PromiseLike<unknown>> = [];
  for (const [id, val] of assignments) {
    const prev = byId.get(id);
    if (!prev) continue;
    // If this was a pinned video that lost its pinning (orphan), unpin it too.
    const shouldUnpin = prev.pinned && !honoredPinnedIds.has(id);
    if (
      prev.scheduled_at === val.scheduled_at &&
      prev.queue_position === val.queue_position &&
      !shouldUnpin
    ) {
      continue;
    }
    const update: {
      scheduled_at: string;
      queue_position: number;
      pinned?: boolean;
    } = {
      scheduled_at: val.scheduled_at,
      queue_position: val.queue_position,
    };
    if (shouldUnpin) update.pinned = false;
    updates.push(supabase.from("videos").update(update).eq("id", id));
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

/**
 * Append a fresh upload. If `pinnedAt` is provided, the video is pinned to
 * that exact slot (UTC ISO string). Otherwise it floats to the next free slot.
 */
export async function appendToQueue(payload: {
  workspaceId: string;
  storagePath: string;
  baseText: string;
  hashtags: string;
  ytTitle?: string;
  ytDescription?: string;
  pinnedAt?: string | null;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // If pinned, make sure the slot isn't already taken.
  if (payload.pinnedAt) {
    const targetKey = slotKey(payload.pinnedAt);
    const { data: clash } = await supabase
      .from("videos")
      .select("id, scheduled_at")
      .eq("workspace_id", payload.workspaceId)
      .eq("status", "pending")
      .not("scheduled_at", "is", null);
    const taken = (clash ?? []).some(
      (v) => v.scheduled_at && slotKey(v.scheduled_at) === targetKey,
    );
    if (taken) {
      throw new Error("Esse horário já está ocupado por outro vídeo");
    }
  }

  const { error } = await supabase.from("videos").insert({
    workspace_id: payload.workspaceId,
    video_url: payload.storagePath,
    storage_path: payload.storagePath,
    base_text: payload.baseText,
    caption: payload.baseText,
    hashtags: payload.hashtags,
    yt_title: payload.ytTitle ?? "",
    yt_description: payload.ytDescription ?? "",
    status: "pending",
    pinned: !!payload.pinnedAt,
    scheduled_at: payload.pinnedAt ?? null,
    uploaded_by: user.id,
  });

  if (error) throw error;

  await recomputeQueue(payload.workspaceId);
}

/**
 * Move a video to a specific slot (drag-and-drop), pinning it there.
 * If the target slot is already occupied, the existing pinned video at that
 * slot is unpinned (becomes floating) so the queue can reflow around the move.
 */
export async function moveVideoToSlot(
  videoId: string,
  workspaceId: string,
  slotIso: string,
): Promise<void> {
  const targetKey = slotKey(slotIso);

  // Find any pending video already at this slot (other than the one being moved).
  const { data: clash } = await supabase
    .from("videos")
    .select("id, scheduled_at, pinned")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .neq("id", videoId)
    .not("scheduled_at", "is", null);

  const occupant = (clash ?? []).find(
    (v) => v.scheduled_at && slotKey(v.scheduled_at) === targetKey,
  );

  // If a pinned video occupies the slot, unpin it so it can flow to the next free slot.
  if (occupant?.pinned) {
    await supabase.from("videos").update({ pinned: false }).eq("id", occupant.id);
  }

  // Pin the moved video to the target slot.
  const { error } = await supabase
    .from("videos")
    .update({ pinned: true, scheduled_at: slotIso })
    .eq("id", videoId);
  if (error) throw error;

  await recomputeQueue(workspaceId);
}

/**
 * Move a video to a target day (yyyy-mm-dd in SP). Picks the first free slot
 * of that day and pins the video there. If all slots are taken, returns false
 * so the caller can show feedback. The queue is recomputed after.
 *
 * Used by drag-and-drop on the monthly calendar.
 */
export async function moveVideoToDay(
  videoId: string,
  workspaceId: string,
  dateKey: string,
): Promise<{ ok: boolean; slotIso?: string; reason?: "full" | "past" }> {
  const wsSlots = await getWorkspaceSlots(workspaceId);
  const slots = getSlotsForDateKey(dateKey, wsSlots);
  if (slots.length === 0) return { ok: false, reason: "past" };

  // Find which slots are already taken by OTHER pending videos in this workspace.
  const { data: others } = await supabase
    .from("videos")
    .select("id, scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .neq("id", videoId)
    .not("scheduled_at", "is", null);

  const taken = new Set(
    (others ?? [])
      .map((o) => (o.scheduled_at ? slotKey(o.scheduled_at) : null))
      .filter((k): k is string => !!k),
  );

  const free = slots.find((s) => !taken.has(slotKey(s)));
  if (!free) return { ok: false, reason: "full" };

  const slotIso = free.toISOString();
  const { error } = await supabase
    .from("videos")
    .update({ pinned: true, scheduled_at: slotIso })
    .eq("id", videoId);
  if (error) throw error;

  await recomputeQueue(workspaceId);
  return { ok: true, slotIso };
}

/** Mark as posted and stamp posted_at. */
export async function markPosted(id: string): Promise<void> {
  const { error } = await supabase
    .from("videos")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Skip: unpin and let recompute push it to the next free slot after others. */
export async function skipVideo(id: string, workspaceId: string): Promise<void> {
  // Push it to the far future so the recompute treats it as last in chronological order.
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("videos")
    .update({ pinned: false, scheduled_at: farFuture })
    .eq("id", id);
  if (error) throw error;

  await recomputeQueue(workspaceId);
}

/**
 * Fila inteligente: detecta vídeos pendentes cujo horário + buffer já passou
 * sem terem sido marcados como postados, desafixa eles e empurra para o fim
 * da fila. O recomputeQueue em seguida realoca tudo para os próximos slots
 * livres, fazendo a agenda "rolar" sozinha.
 *
 * Buffer padrão: 30 minutos.
 */
export async function autoSkipOverdue(
  workspaceId: string,
  bufferMinutes = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - bufferMinutes * 60 * 1000).toISOString();
  const { data: overdue } = await supabase
    .from("videos")
    .select("id, scheduled_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .not("scheduled_at", "is", null)
    .lt("scheduled_at", cutoff);

  if (!overdue || overdue.length === 0) return 0;

  // Empurra cada um para um futuro distante, escalonando para preservar a ordem relativa.
  // O recompute em seguida vai colocá-los nos próximos slots livres na mesma ordem.
  const baseFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
  await Promise.all(
    overdue.map((v, idx) =>
      supabase
        .from("videos")
        .update({
          pinned: false,
          scheduled_at: new Date(baseFuture + idx * 60 * 1000).toISOString(),
        })
        .eq("id", v.id),
    ),
  );

  await recomputeQueue(workspaceId);
  return overdue.length;
}


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
