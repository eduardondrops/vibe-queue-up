import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  dayKey,
  parseSlots,
  slotKey,
  slotLabelForDate,
  spWallToUtc,
  todayKey,
  type Slot,
} from "@/lib/scheduling";
import { getWorkspaceSchedule } from "@/lib/workspace-schedule";
import { markPosted, moveVideoToSlot, postponeOverdueVideo, recomputeQueue, type QueueVideo } from "@/lib/queue";
import { getMyRole, getWorkspace, type Workspace } from "@/lib/workspaces";
import { generateCaption, buildYouTube } from "@/lib/captions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PlatformCaptions } from "@/components/PlatformCaptions";
import { EditPostDialog } from "@/components/EditPostDialog";
import {
  ChevronLeft,
  ChevronDown,
  Download,
  DownloadCloud,
  Check,
  SkipForward,
  Loader2,
  Move,
  Pin,
  PinOff,
  Plus,
  Pencil,
  CircleDashed,
  CheckCircle2,
  SkipForward as SkipIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/w/$workspaceId/day/$date")({
  head: ({ params }) => ({
    meta: [
      { title: `Vídeos do dia ${params.date} — PostFlow` },
      { name: "description", content: "Vídeos agendados para o dia." },
    ],
  }),
  component: DayPage,
});

function DayPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { workspaceId, date } = Route.useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [w, role] = await Promise.all([
        getWorkspace(workspaceId),
        getMyRole(workspaceId),
      ]);
      setWorkspace(w);
      setCanEdit(role === "owner" || role === "editor");
      if (!w) navigate({ to: "/" });
    })();
  }, [workspaceId, user, navigate]);

  if (loading || !user || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <AppShell workspaceId={workspaceId} workspaceName={workspace.name}>
      <DayList workspaceId={workspaceId} dateKey={date} canEdit={canEdit} />
    </AppShell>
  );
}

function DayList({
  workspaceId,
  dateKey: dKey,
  canEdit,
}: {
  workspaceId: string;
  dateKey: string;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wsSlots, setWsSlots] = useState<Slot[]>(() => parseSlots(null));

  useEffect(() => {
    let cancel = false;
    getWorkspaceSchedule(workspaceId).then((s) => {
      if (!cancel) setWsSlots(parseSlots(s.slots));
    });
    return () => {
      cancel = true;
    };
  }, [workspaceId]);

  const isPast = dKey < todayKey();
  const isToday = dKey === todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    const [y, m, d] = dKey.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);

    const { data, error } = await supabase
      .from("videos")
      .select(
        "id, workspace_id, video_url, storage_path, caption, base_text, hashtags, yt_title, yt_description, status, queue_position, scheduled_at, posted_at, uploaded_by, pinned, created_at",
      )
      .eq("workspace_id", workspaceId)
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar vídeos");
      setLoading(false);
      return;
    }

    const list = (data ?? []) as QueueVideo[];
    setVideos(list);
    setLoading(false);
  }, [dKey, workspaceId]);

  /**
   * Lazy load: pede signed URL apenas quando o usuário expande o card.
   * Mantém em cache para evitar requisições repetidas ao re-expandir.
   */
  const ensureSignedUrl = useCallback(
    async (video: QueueVideo) => {
      if (signedUrls[video.id]) return;
      const { data: signed } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.storage_path, 3600);
      if (signed?.signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [video.id]: signed.signedUrl }));
      }
    },
    [signedUrls],
  );

  function handleToggleExpand(video: QueueVideo) {
    setExpandedId((curr) => {
      const next = curr === video.id ? null : video.id;
      if (next) void ensureSignedUrl(video);
      return next;
    });
  }

  useEffect(() => {
    load();
  }, [load]);

  const dateLabel = (() => {
    const [y, m, d] = dKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  })();

  // Build "slot view" — known slots from workspace schedule.
  const slotView = useMemo(() => {
    const [y, m, d] = dKey.split("-").map(Number);
    return wsSlots.map((s) => {
      const iso = spWallToUtc(y, m, d, s.h, s.m).toISOString();
      const k = slotKey(iso);
      const video = videos.find(
        (v) => v.scheduled_at && slotKey(v.scheduled_at) === k,
      );
      const slotIsPast = new Date(iso).getTime() <= Date.now();
      return { iso, label: s.label, video, slotIsPast };
    });
  }, [dKey, videos, wsSlots]);

  // Orphan videos: scheduled for this day but NOT matching any configured slot
  // (e.g., schedule was changed after the video was scheduled). We show them
  // separately so the user can see them and reorganize the queue.
  const orphanVideos = useMemo(() => {
    const validKeys = new Set(slotView.map((s) => slotKey(s.iso)));
    return videos.filter(
      (v) => v.scheduled_at && !validKeys.has(slotKey(v.scheduled_at)),
    );
  }, [videos, slotView]);

  async function handlePosted(id: string) {
    setBusyId(id);
    try {
      await markPosted(id);
      toast.success("Marcado como postado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSkip(id: string) {
    setBusyId(id);
    try {
      await postponeOverdueVideo(id, workspaceId);
      toast.success("Fila empurrada para o próximo horário disponível");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMove(videoId: string, targetIso: string) {
    setBusyId(videoId);
    try {
      await moveVideoToSlot(videoId, workspaceId, targetIso);
      const targetDay = dayKey(targetIso);
      toast.success(
        targetDay === dKey
          ? "Movido"
          : `Movido para ${new Date(targetIso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${slotLabelForDate(targetIso)}`,
      );
      if (targetDay !== dKey) {
        navigate({
          to: "/w/$workspaceId/day/$date",
          params: { workspaceId, date: targetDay },
        });
      } else {
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover");
      setBusyId(null);
    }
  }

  async function handleTogglePin(videoId: string, currentPinned: boolean) {
    setBusyId(videoId);
    try {
      await supabase
        .from("videos")
        .update({ pinned: !currentPinned })
        .eq("id", videoId);
      toast.success(currentPinned ? "Vídeo desafixado" : "Vídeo fixado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Calendário
      </Link>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Agenda do dia
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold capitalize">
            {dateLabel}
          </h1>
        </div>
        {videos.length > 0 && (
          <DownloadAllButton videos={videos} dateKey={dKey} />
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <>
          {orphanVideos.length > 0 && (
            <div className="glass mb-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-destructive">
                    {orphanVideos.length} {orphanVideos.length === 1 ? "vídeo fora" : "vídeos fora"} dos horários atuais
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A estratégia mudou depois que esses vídeos foram agendados. Reorganize a fila para encaixar nos novos horários.
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/60 text-destructive hover:bg-destructive/20"
                    onClick={async () => {
                      try {
                        await recomputeQueue(workspaceId);
                        toast.success("Fila reorganizada");
                        await load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Erro");
                      }
                    }}
                  >
                    Reorganizar fila
                  </Button>
                )}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {orphanVideos.map((v) => (
                  <li key={v.id}>
                    • {v.scheduled_at ? slotLabelForDate(v.scheduled_at) : "--:--"} —{" "}
                    {(v.yt_title || v.base_text || "Sem título").split("\n")[0].slice(0, 60)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            {slotView.map(({ iso, label, video, slotIsPast }) => {
              if (video) {
                const isExpanded = expandedId === video.id;
                const isOverdue = video.status === "pending" && slotIsPast;
                return (
                  <VideoSlotItem
                    key={iso}
                    video={video}
                    expanded={isExpanded}
                    onToggle={() => handleToggleExpand(video)}
                    playbackUrl={isExpanded ? signedUrls[video.id] ?? "" : ""}
                    busy={busyId === video.id}
                    canEdit={canEdit}
                    isOverdue={isOverdue}
                    onPosted={() => handlePosted(video.id)}
                    onSkip={() => handleSkip(video.id)}
                    onMove={(targetIso) => handleMove(video.id, targetIso)}
                    onTogglePin={() => handleTogglePin(video.id, video.pinned)}
                    onEdit={() => setEditingId(video.id)}
                    workspaceId={workspaceId}
                  />
                );
              }
              // Empty slot
              const showAdd = canEdit && !slotIsPast && !isPast;
              return (
                <EmptySlotCard
                  key={iso}
                  label={label}
                  workspaceId={workspaceId}
                  slotIso={iso}
                  isToday={isToday}
                  slotIsPast={slotIsPast}
                  showAdd={showAdd}
                />
              );
            })}
          </div>
        </>
      )}

      <EditPostDialog
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
        post={videos.find((v) => v.id === editingId) ?? null}
        onSaved={() => {
          setEditingId(null);
          void load();
        }}
      />
    </div>
  );
}

function EmptySlotCard({
  label,
  workspaceId,
  slotIso,
  slotIsPast,
  showAdd,
}: {
  label: string;
  workspaceId: string;
  slotIso: string;
  isToday: boolean;
  slotIsPast: boolean;
  showAdd: boolean;
}) {
  const dateK = dayKey(slotIso);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 ${
        slotIsPast
          ? "border-border/40 bg-muted/20 text-muted-foreground/60"
          : "border-border bg-surface/50 text-muted-foreground"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl font-bold">{label}</span>
        <span className="text-xs">
          {slotIsPast ? "Horário passou" : "Slot livre"}
        </span>
      </div>
      {showAdd && (
        <Link
          to="/w/$workspaceId/upload"
          params={{ workspaceId }}
          search={{ day: dateK, slot: slotIso } as never}
          className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Link>
      )}
    </div>
  );
}

/**
 * Item de slot do dia em modo compacto + expansão sob demanda.
 * - Compacto: linha única com horário, título (yt_title ou 1ª linha do base_text), status.
 * - Expandido: player (lazy), legendas por plataforma e ações (postar/pular/mover/fixar).
 * Apenas um item pode estar expandido por vez (controlado pelo pai).
 */
function VideoSlotItem({
  video,
  expanded,
  onToggle,
  playbackUrl,
  busy,
  canEdit,
  workspaceId,
  onPosted,
  onSkip,
  onMove,
  onTogglePin,
  onEdit,
}: {
  video: QueueVideo;
  expanded: boolean;
  onToggle: () => void;
  playbackUrl: string;
  busy: boolean;
  canEdit: boolean;
  workspaceId: string;
  onPosted: () => void;
  onSkip: () => void;
  onMove: (targetIso: string) => void;
  onTogglePin: () => void;
  onEdit: () => void;
}) {
  const time = video.scheduled_at ? slotLabelForDate(video.scheduled_at) : "--:--";
  const baseText = video.base_text || video.caption;

  // Título: yt_title prioritário; fallback = primeira linha não vazia do base_text/caption.
  const title = (() => {
    if (video.yt_title?.trim()) return video.yt_title.trim();
    const firstLine = baseText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return firstLine || "Sem título";
  })();

  const statusMeta = {
    pending: {
      label: "Não postado",
      Icon: CircleDashed,
      cls: "text-muted-foreground",
    },
    posted: {
      label: "Postado",
      Icon: CheckCircle2,
      cls: "text-success",
    },
    skipped: {
      label: "Pulado",
      Icon: SkipIcon,
      cls: "text-muted-foreground/70",
    },
  }[video.status];
  const StatusIcon = statusMeta.Icon;

  return (
    <article
      className={`glass overflow-hidden rounded-2xl shadow-[var(--shadow-card)] transition-all duration-200 ${
        expanded ? "ring-1 ring-primary/40" : ""
      }`}
    >
      {/* Linha compacta — sempre visível, clicável */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/40"
      >
        <span className="shrink-0 font-display text-lg font-bold tabular-nums">
          {time}h
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </span>
        {video.pinned && (
          <Pin
            className="h-3.5 w-3.5 shrink-0 text-primary"
            aria-label="Fixado"
          />
        )}
        <span
          className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${statusMeta.cls}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{statusMeta.label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Conteúdo expandido — player só carrega quando expanded=true */}
      {expanded && (
        <div className="border-t border-border">
          <div className="flex items-center justify-end gap-2 px-4 py-2">
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            <DownloadVideoButton
              storagePath={video.storage_path}
              fileName={video.storage_path.split("/").pop() ?? "video.mp4"}
            />
          </div>

          {playbackUrl ? (
            <video
              src={playbackUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full bg-black"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center bg-black text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          <div className="space-y-4 p-4">
            {(baseText || video.hashtags || video.yt_title || video.yt_description) && (
              <PlatformCaptions
                baseText={baseText}
                hashtags={video.hashtags}
                ytTitle={video.yt_title}
                ytDescription={video.yt_description}
              />
            )}

            {video.status === "pending" && (
              <>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={onPosted}
                    disabled={busy}
                    className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" /> Postado
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={onSkip}
                    disabled={busy}
                    variant="outline"
                    className="flex-1"
                  >
                    <SkipForward className="mr-1 h-4 w-4" /> Pular
                  </Button>
                </div>

                {canEdit && (
                  <div className="flex gap-2">
                    <MoveVideoButton
                      workspaceId={workspaceId}
                      currentVideoId={video.id}
                      currentScheduledAt={video.scheduled_at}
                      onMove={onMove}
                      disabled={busy}
                    />
                    <Button
                      onClick={onTogglePin}
                      disabled={busy}
                      variant="outline"
                      className="flex-1"
                      title={
                        video.pinned
                          ? "Desafixar — pode ser realocado pela fila"
                          : "Fixar neste horário"
                      }
                    >
                      {video.pinned ? (
                        <>
                          <PinOff className="mr-1 h-4 w-4" /> Desafixar
                        </>
                      ) : (
                        <>
                          <Pin className="mr-1 h-4 w-4" /> Fixar
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function MoveVideoButton({
  workspaceId,
  currentVideoId,
  currentScheduledAt,
  onMove,
  disabled,
}: {
  workspaceId: string;
  currentVideoId: string;
  currentScheduledAt: string | null;
  onMove: (targetIso: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [wsSlots, setWsSlots] = useState<Slot[]>(() => parseSlots(null));

  useEffect(() => {
    let cancel = false;
    getWorkspaceSchedule(workspaceId).then((s) => {
      if (!cancel) setWsSlots(parseSlots(s.slots));
    });
    return () => {
      cancel = true;
    };
  }, [workspaceId]);

  // Preload taken slots for next 14 days when popover opens.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today);
      end.setDate(today.getDate() + 14);
      end.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("videos")
        .select("id, scheduled_at, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString());
      if (cancel) return;
      const set = new Set<string>();
      (data ?? []).forEach((v) => {
        if (v.scheduled_at && v.id !== currentVideoId) {
          set.add(slotKey(v.scheduled_at));
        }
      });
      setTaken(set);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [open, workspaceId, currentVideoId]);

  const days = useMemo(() => {
    const today = new Date();
    const out: Array<{ key: string; label: string; slots: Array<{ iso: string; label: string; disabled: boolean; current: boolean }> }> = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const k = dayKey(d);
      const slots = wsSlots.map((s) => {
        const iso = spWallToUtc(y, m, day, s.h, s.m).toISOString();
        const sk = slotKey(iso);
        const isPast = new Date(iso).getTime() <= Date.now();
        const isCurrent = currentScheduledAt
          ? slotKey(currentScheduledAt) === sk
          : false;
        return {
          iso,
          label: s.label,
          disabled: isPast || (!isCurrent && taken.has(sk)),
          current: isCurrent,
        };
      });
      out.push({
        key: k,
        label: d.toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        }),
        slots,
      });
    }
    return out;
  }, [taken, currentScheduledAt, wsSlots]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex-1" disabled={disabled}>
          <Move className="mr-1 h-4 w-4" /> Mover
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[60vh] w-80 overflow-y-auto p-0"
      >
        <div className="border-b border-border bg-surface px-3 py-2">
          <p className="text-xs font-semibold">Mover para…</p>
          <p className="text-[11px] text-muted-foreground">
            Slots ocupados aparecem desabilitados.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {days.map((d) => (
              <li key={d.key} className="px-3 py-2">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {d.label}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {d.slots.map((s) => (
                    <button
                      key={s.iso}
                      type="button"
                      disabled={s.disabled || s.current}
                      onClick={() => {
                        setOpen(false);
                        onMove(s.iso);
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                        s.current
                          ? "cursor-default border-success/50 bg-success/10 text-success-foreground"
                          : s.disabled
                            ? "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground/40"
                            : "border-border bg-surface text-foreground hover:border-primary/60 hover:bg-primary/5"
                      }`}
                    >
                      {s.current ? `★ ${s.label}` : s.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Botão de download que pede uma signed URL fresca a cada clique (1h).
 * Usa <a download> programático para forçar download mesmo em mobile.
 */
function DownloadVideoButton({
  storagePath,
  fileName,
}: {
  storagePath: string;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("videos")
        .createSignedUrl(storagePath, 3600, { download: fileName });
      if (error || !data?.signedUrl) {
        throw error ?? new Error("URL não disponível");
      }
      // Em mobile, abrir em nova aba é mais confiável que <a download>.
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}{" "}
      Baixar
    </button>
  );
}

/**
 * "Baixar tudo" — para cada vídeo do dia, dispara o download do MP4 e
 * de um .txt com legendas (Instagram/TikTok/Facebook) + título e descrição
 * do YouTube. Usa signed URLs frescas (1h). Sem ZIP — links separados.
 */
function DownloadAllButton({
  videos,
  dateKey: dKey,
}: {
  videos: QueueVideo[];
  dateKey: string;
}) {
  const [busy, setBusy] = useState(false);

  function buildCaptionsTxt(v: QueueVideo): string {
    const baseText = v.base_text || v.caption || "";
    const yt = buildYouTube({
      baseText,
      hashtags: v.hashtags,
      ytTitle: v.yt_title,
      ytDescription: v.yt_description,
    });
    const ig = generateCaption("instagram", baseText, v.hashtags);
    const tt = generateCaption("tiktok", baseText, v.hashtags);
    const fb = generateCaption("facebook", baseText, v.hashtags);
    const sep = "\n\n----------------------------------------\n\n";
    return [
      `=== INSTAGRAM ===\n${ig}`,
      `=== TIKTOK ===\n${tt}`,
      `=== YOUTUBE ===\nTítulo: ${yt.title}\n\n${yt.description}\n\n${yt.hashtags}`,
      `=== FACEBOOK ===\n${fb}`,
    ].join(sep);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeName(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "post";
  }

  async function handleDownloadAll() {
    if (busy) return;
    setBusy(true);
    const total = videos.length;
    toast.info(`Iniciando download de ${total} post${total > 1 ? "s" : ""}...`);
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const time = v.scheduled_at
        ? slotLabelForDate(v.scheduled_at).replace(":", "h")
        : "auto";
      const titleSrc = v.yt_title?.trim() || (v.base_text || v.caption).split("\n")[0] || "post";
      const baseName = `${dKey}_${time}_${safeName(titleSrc)}`;

      try {
        // 1) Legendas (.txt)
        const txt = buildCaptionsTxt(v);
        downloadBlob(
          new Blob([txt], { type: "text/plain;charset=utf-8" }),
          `${baseName}.txt`,
        );

        // 2) Vídeo (signed URL com download forçado)
        const ext = v.storage_path.split(".").pop() || "mp4";
        const { data, error } = await supabase.storage
          .from("videos")
          .createSignedUrl(v.storage_path, 3600, {
            download: `${baseName}.${ext}`,
          });
        if (error || !data?.signedUrl) throw error ?? new Error("Sem URL");

        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = `${baseName}.${ext}`;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        ok++;
        // Espaça os downloads para o browser não bloquear
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        console.error("Falha ao baixar", v.id, err);
        fail++;
      }
    }

    setBusy(false);
    if (fail === 0) {
      toast.success(`${ok} post${ok > 1 ? "s baixados" : " baixado"} com sucesso`);
    } else {
      toast.warning(`${ok} baixados, ${fail} falharam`);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleDownloadAll}
      disabled={busy}
      variant="outline"
      className="gap-2"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <DownloadCloud className="h-4 w-4" />
      )}
      Baixar tudo
    </Button>
  );
}
