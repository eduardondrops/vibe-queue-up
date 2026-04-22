import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, slotLabelForDate } from "@/lib/scheduling";
import { autoDeleteOldPosted, moveVideoToDay, recomputeQueue } from "@/lib/queue";
import { getMyRole, getWorkspace, type Workspace } from "@/lib/workspaces";
import { ChevronLeft, ChevronRight, UserPlus, GripVertical } from "lucide-react";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";
import { PostingHealthCard } from "@/components/PostingHealthCard";
import { toast } from "sonner";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";

export const Route = createFileRoute("/w/$workspaceId/")({
  head: () => ({
    meta: [
      { title: "Calendário — PostFlow" },
      { name: "description", content: "Veja os Reels agendados deste perfil." },
    ],
  }),
  component: WorkspaceCalendarPage,
});

type DayVideo = {
  id: string;
  status: "pending" | "posted" | "skipped";
  scheduled_at: string;
  pinned: boolean;
  title: string;
};

type DaySummary = {
  total: number;
  pending: number;
  posted: number;
  nextTime?: string;
  videos: DayVideo[];
};

function WorkspaceCalendarPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [role, setRole] = useState<"owner" | "editor" | "viewer" | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      setWsLoading(true);
      const [w, r] = await Promise.all([
        getWorkspace(workspaceId),
        getMyRole(workspaceId),
      ]);
      if (!cancel) {
        setWorkspace(w);
        setRole(r);
        setWsLoading(false);
        if (!w) {
          navigate({ to: "/" });
        } else {
          // Run housekeeping without moving overdue posts automatically:
          // they stay in place until the user confirms whether they were posted.
          recomputeQueue(workspaceId).catch(() => {});
          autoDeleteOldPosted(workspaceId).catch(() => {});
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [workspaceId, user, navigate]);

  if (loading || !user || wsLoading || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const canDrag = role === "owner" || role === "editor";

  return (
    <AppShell workspaceId={workspaceId} workspaceName={workspace.name}>
      <Calendar
        workspaceId={workspaceId}
        canInvite={role === "owner"}
        canDrag={canDrag}
      />
    </AppShell>
  );
}

function Calendar({
  workspaceId,
  canInvite,
  canDrag,
}: {
  workspaceId: string;
  canInvite: boolean;
  canDrag: boolean;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [byDay, setByDay] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ id: string; from: string } | null>(
    null,
  );
  const [overDay, setOverDay] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const monthLabel = cursor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const firstDay = new Date(cursor);
  const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      const start = new Date(firstDay);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(lastDay);
      end.setDate(end.getDate() + (6 - end.getDay()));
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("videos")
        .select("id, status, scheduled_at, pinned, yt_title, base_text, caption")
        .eq("workspace_id", workspaceId)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString());

      if (cancel) return;
      const map: Record<string, DaySummary> = {};
      (data ?? []).forEach((v) => {
        if (!v.scheduled_at) return;
        const k = dayKey(v.scheduled_at);
        const cur =
          map[k] ?? { total: 0, pending: 0, posted: 0, videos: [] as DayVideo[] };
        cur.total += 1;
        if (v.status === "pending") cur.pending += 1;
        if (v.status === "posted") cur.posted += 1;
        if (!cur.nextTime || slotLabelForDate(v.scheduled_at) < cur.nextTime) {
          cur.nextTime = slotLabelForDate(v.scheduled_at);
        }
        cur.videos.push({
          id: v.id,
          status: v.status as DayVideo["status"],
          scheduled_at: v.scheduled_at,
          pinned: !!v.pinned,
          title: (v.yt_title || v.base_text || v.caption || "Sem título").split("\n")[0],
        });
        map[k] = cur;
      });
      // sort each day chronologically
      Object.values(map).forEach((d) =>
        d.videos.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
      );
      setByDay(map);
      setLoading(false);
    }
    load();
    return () => {
      cancel = true;
    };
  }, [cursor.getFullYear(), cursor.getMonth(), workspaceId, reloadTick]);

  const grid = useMemo(() => {
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor.getFullYear(), cursor.getMonth()]);

  const todayK = dayKey(new Date());
  const todaySummary = byDay[todayK];

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const from = String(e.active.data.current?.fromDay ?? "");
    setActiveDrag({ id, from });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const drag = activeDrag;
    setActiveDrag(null);
    setOverDay(null);
    if (!drag || !e.over) return;
    const targetDay = String(e.over.id);
    if (targetDay === drag.from) return;
    if (targetDay < todayK) {
      toast.error("Não dá pra agendar no passado");
      return;
    }

    // Optimistic UI: remove from origin day visually so user sees instant feedback.
    const snapshot = byDay;
    setByDay((prev) => {
      const next: Record<string, DaySummary> = { ...prev };
      const fromDay = next[drag.from];
      if (fromDay) {
        const newVideos = fromDay.videos.filter((v) => v.id !== drag.id);
        const removed = fromDay.videos.find((v) => v.id === drag.id);
        if (removed) {
          next[drag.from] = {
            ...fromDay,
            total: Math.max(0, fromDay.total - 1),
            pending:
              removed.status === "pending"
                ? Math.max(0, fromDay.pending - 1)
                : fromDay.pending,
            posted:
              removed.status === "posted"
                ? Math.max(0, fromDay.posted - 1)
                : fromDay.posted,
            videos: newVideos,
          };
        }
      }
      return next;
    });

    try {
      const res = await moveVideoToDay(drag.id, workspaceId, targetDay);
      if (!res.ok) {
        setByDay(snapshot);
        if (res.reason === "full") {
          toast.error("Esse dia já tem 3 posts agendados");
        } else if (res.reason === "past") {
          toast.error("Não dá pra agendar no passado");
        } else {
          toast.error("Não foi possível mover");
        }
        return;
      }
      toast.success(`Movido para ${targetDay.split("-").reverse().join("/")}`);
      // reload to get the canonical scheduled_at after recompute
      setReloadTick((t) => t + 1);
    } catch (err) {
      setByDay(snapshot);
      toast.error("Erro ao mover post");
      console.error(err);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => setOverDay(e.over ? String(e.over.id) : null)}
      onDragCancel={() => {
        setActiveDrag(null);
        setOverDay(null);
      }}
    >
      <div>
        <PostingHealthCard workspaceId={workspaceId} />
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Sua fila
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold capitalize">
              {monthLabel}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
              className="rounded-lg border border-border bg-surface p-2 text-muted-foreground hover:text-foreground"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                setCursor(d);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Hoje
            </button>
            <button
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
              className="rounded-lg border border-border bg-surface p-2 text-muted-foreground hover:text-foreground"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {canInvite && (
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteOpen(true)}
              className="border-primary/40 text-primary hover:bg-primary/5"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Convidar membro
            </Button>
          </div>
        )}

        <TodayPreview summary={todaySummary} loading={loading} />

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((d) => {
            const k = dayKey(d);
            const summary = byDay[k];
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = k === todayK;
            const isPast = k < todayK;
            const hasItems = summary && summary.total > 0;
            const clickable = (inMonth || hasItems) && !activeDrag;
            const isOverThis = overDay === k;
            const isFull = false;
            const dropEligible = !isPast && !!activeDrag;
            const invalidDrop =
              isOverThis &&
              activeDrag &&
              (isPast || (isFull && activeDrag.from !== k));

            return (
              <CalendarCell
                key={k}
                dateKey={k}
                day={d}
                summary={summary}
                inMonth={inMonth}
                isToday={isToday}
                isPast={isPast}
                clickable={clickable && !activeDrag}
                workspaceId={workspaceId}
                canDrag={canDrag}
                dropEligible={dropEligible}
                isOver={isOverThis}
                invalidDrop={!!invalidDrop}
                draggingId={activeDrag?.id ?? null}
              />
            );
          })}
        </div>

        {loading && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Carregando...
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="grad-bg h-2 w-2 rounded-full" /> Pendente
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-destructive h-2 w-2 rounded-full" /> Atrasado
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-success h-2 w-2 rounded-full" /> Postado
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-muted-foreground h-2 w-2 rounded-full" /> Pulado
          </div>
        </div>

        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          workspaceId={workspaceId}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-primary/60 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary shadow-[0_8px_24px_-8px_oklch(0.68_0.26_358/0.6)] backdrop-blur">
            <GripVertical className="h-3 w-3" />
            Movendo post
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function CalendarCell({
  dateKey: k,
  day: d,
  summary,
  inMonth,
  isToday,
  isPast,
  clickable,
  workspaceId,
  canDrag,
  dropEligible,
  isOver,
  invalidDrop,
  draggingId,
}: {
  dateKey: string;
  day: Date;
  summary: DaySummary | undefined;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  clickable: boolean;
  workspaceId: string;
  canDrag: boolean;
  dropEligible: boolean;
  isOver: boolean;
  invalidDrop: boolean;
  draggingId: string | null;
}) {
  const { setNodeRef } = useDroppable({ id: k, disabled: !dropEligible });
  const hasItems = summary && summary.total > 0;
  const firstPending = summary?.videos.find((v) => v.status === "pending");
  const draggableVideo =
    canDrag && !isPast && firstPending ? firstPending : null;

  const baseClasses =
    "relative flex aspect-square flex-col items-center justify-start rounded-xl border p-1.5 text-xs transition-all";

  let stateClasses = "";
  if (!inMonth) {
    stateClasses =
      "border-transparent bg-transparent text-muted-foreground/40";
  } else if (isToday) {
    stateClasses =
      "border-success/60 bg-success text-success-foreground ring-2 ring-success/70 ring-offset-2 ring-offset-background shadow-[0_8px_24px_-8px_oklch(0.72_0.18_155/0.6)]";
  } else if (isPast) {
    stateClasses =
      "border-border/40 bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed";
  } else {
    stateClasses = "border-border bg-surface text-foreground";
  }

  // Drop-state overlays
  let dropClasses = "";
  if (isOver && dropEligible) {
    dropClasses = invalidDrop
      ? "ring-2 ring-destructive/70 border-destructive/60 animate-pulse"
      : "ring-2 ring-primary/80 border-primary/70 shadow-[0_0_0_4px_oklch(0.68_0.26_358/0.18)] scale-[1.02]";
  } else if (dropEligible && !isPast) {
    dropClasses = "border-dashed border-border/60";
  }

  const hoverClasses = clickable
    ? "hover:border-primary/60 hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5"
    : "";

  const cell = (
    <div
      ref={setNodeRef}
      className={[baseClasses, stateClasses, dropClasses, hoverClasses].join(" ")}
      aria-disabled={isPast && inMonth ? true : undefined}
    >
      {isToday && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-success px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-success-foreground shadow-sm">
          Hoje
        </span>
      )}
      <span
        className={`font-display text-sm ${
          isToday ? "font-bold text-success-foreground" : ""
        } ${isPast && inMonth ? "text-muted-foreground" : ""}`}
      >
        {d.getDate()}
      </span>
      {hasItems && (
        <div className="mt-auto flex w-full flex-col items-center gap-0.5">
          {draggableVideo ? (
            <DraggablePostBadge
              videoId={draggableVideo.id}
              fromDay={k}
              count={summary!.total}
              isToday={isToday}
              isPastInMonth={isPast && inMonth}
              isHigh={summary!.total >= 3}
              isBeingDragged={draggingId === draggableVideo.id}
            />
          ) : (
            <span
              className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-md px-1.5 py-0.5 font-display text-sm font-bold leading-none ${
                isToday
                  ? "bg-success-foreground/20 text-success-foreground"
                  : isPast && inMonth
                    ? "bg-muted-foreground/15 text-muted-foreground"
                    : (summary!.total >= 3)
                      ? "grad-bg text-primary-foreground shadow-[0_4px_12px_-4px_oklch(0.68_0.26_358/0.5)]"
                      : "bg-primary/15 text-primary"
              }`}
            >
              {summary!.total}
            </span>
          )}
          {summary!.pending > 0 && !isPast && !isToday && (
            <span className="text-[9px] text-muted-foreground">
              {summary!.pending} pend.
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <Link to="/w/$workspaceId/day/$date" params={{ workspaceId, date: k }}>
        {cell}
      </Link>
    );
  }
  return cell;
}

function TodayPreview({
  summary,
  loading,
}: {
  summary: DaySummary | undefined;
  loading: boolean;
}) {
  const videos = summary?.videos ?? [];
  return (
    <div className="glass mb-5 rounded-2xl border border-border/70 bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Hoje</p>
          <h2 className="font-display text-lg font-bold">Postagens do dia</h2>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          {loading ? "..." : `${videos.length} ${videos.length === 1 ? "post" : "posts"}`}
        </span>
      </div>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma postagem agendada para hoje.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => {
            const isOverdue = video.status === "pending" && new Date(video.scheduled_at).getTime() <= Date.now();
            return (
              <div key={video.id} className="rounded-xl border border-border bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold">{slotLabelForDate(video.scheduled_at)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isOverdue ? "bg-destructive/15 text-destructive" : video.status === "posted" ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}>
                    {isOverdue ? "Atrasado" : video.status === "posted" ? "Postado" : "Pendente"}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-foreground">{video.title}</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Arraste posts entre os dias do calendário para organizar a fila.
      </p>
    </div>
  );
}

function DraggablePostBadge({
  videoId,
  fromDay,
  count,
  isToday,
  isPastInMonth,
  isHigh,
  isBeingDragged,
}: {
  videoId: string;
  fromDay: string;
  count: number;
  isToday: boolean;
  isPastInMonth: boolean;
  isHigh: boolean;
  isBeingDragged: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: videoId,
    data: { fromDay },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={(e) => e.preventDefault()}
      className={`inline-flex min-w-[1.5rem] cursor-grab touch-none items-center justify-center rounded-md px-1.5 py-0.5 font-display text-sm font-bold leading-none transition-opacity active:cursor-grabbing ${
        isToday
          ? "bg-success-foreground/20 text-success-foreground"
          : isPastInMonth
            ? "bg-muted-foreground/15 text-muted-foreground"
            : isHigh
              ? "grad-bg text-primary-foreground shadow-[0_4px_12px_-4px_oklch(0.68_0.26_358/0.5)]"
              : "bg-primary/15 text-primary"
      } ${isBeingDragged ? "opacity-30" : ""}`}
      aria-label={`Arrastar post de ${fromDay}`}
    >
      {count}
    </button>
  );
}
