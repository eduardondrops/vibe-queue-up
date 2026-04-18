import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, slotLabelForDate } from "@/lib/scheduling";
import { autoDeleteOldPosted } from "@/lib/queue";
import { getMyRole, getWorkspace, type Workspace } from "@/lib/workspaces";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";

export const Route = createFileRoute("/w/$workspaceId/")({
  head: () => ({
    meta: [
      { title: "Calendário — PostFlow" },
      { name: "description", content: "Veja os Reels agendados deste perfil." },
    ],
  }),
  component: WorkspaceCalendarPage,
});

type DaySummary = {
  total: number;
  pending: number;
  posted: number;
  nextTime?: string;
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

  return (
    <AppShell workspaceId={workspaceId} workspaceName={workspace.name}>
      <Calendar workspaceId={workspaceId} canInvite={role === "owner"} />
    </AppShell>
  );
}

function Calendar({
  workspaceId,
  canInvite,
}: {
  workspaceId: string;
  canInvite: boolean;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [byDay, setByDay] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

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
        .select("id, status, scheduled_at")
        .eq("workspace_id", workspaceId)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString());

      if (cancel) return;
      const map: Record<string, DaySummary> = {};
      (data ?? []).forEach((v) => {
        if (!v.scheduled_at) return;
        const k = dayKey(v.scheduled_at);
        const cur = map[k] ?? { total: 0, pending: 0, posted: 0 };
        cur.total += 1;
        if (v.status === "pending") cur.pending += 1;
        if (v.status === "posted") cur.posted += 1;
        if (!cur.nextTime || slotLabelForDate(v.scheduled_at) < cur.nextTime) {
          cur.nextTime = slotLabelForDate(v.scheduled_at);
        }
        map[k] = cur;
      });
      setByDay(map);
      setLoading(false);
    }
    load();
    return () => {
      cancel = true;
    };
  }, [cursor.getFullYear(), cursor.getMonth(), workspaceId]);

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

  return (
    <div>
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

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const k = dayKey(d);
          const summary = byDay[k];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayK;
          const isPast = k < todayK;
          const hasItems = summary && summary.total > 0;
          // Now: any future day (in or out of current month) is clickable.
          const clickable = !isPast && (inMonth || hasItems);

          const baseClasses =
            "relative flex aspect-square flex-col items-center justify-start rounded-xl border p-1.5 text-xs transition-all";

          let stateClasses = "";
          if (!inMonth) {
            stateClasses = "border-transparent bg-transparent text-muted-foreground/40";
          } else if (isToday) {
            stateClasses =
              "border-success/60 bg-success text-success-foreground ring-2 ring-success/70 ring-offset-2 ring-offset-background shadow-[0_8px_24px_-8px_oklch(0.72_0.18_155/0.6)]";
          } else if (isPast) {
            stateClasses =
              "border-border/40 bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed";
          } else {
            stateClasses = "border-border bg-surface text-foreground";
          }

          const hoverClasses = clickable
            ? "hover:border-primary/60 hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5"
            : "";

          const cell = (
            <div
              className={[baseClasses, stateClasses, hoverClasses].join(" ")}
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
                  <div className="flex items-center gap-1">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isToday
                          ? "bg-success-foreground"
                          : isPast && inMonth
                            ? "bg-muted-foreground"
                            : "grad-bg"
                      }`}
                    />
                    <span
                      className={`text-[10px] font-semibold ${
                        isToday
                          ? "text-success-foreground"
                          : isPast && inMonth
                            ? "text-muted-foreground"
                            : "text-foreground"
                      }`}
                    >
                      {summary.total}
                    </span>
                  </div>
                  {summary.pending > 0 && !isPast && !isToday && (
                    <span className="text-[9px] text-muted-foreground">
                      {summary.pending} pend.
                    </span>
                  )}
                </div>
              )}
            </div>
          );

          return clickable ? (
            <Link
              key={k}
              to="/w/$workspaceId/day/$date"
              params={{ workspaceId, date: k }}
            >
              {cell}
            </Link>
          ) : (
            <div key={k}>{cell}</div>
          );
        })}
      </div>

      {loading && (
        <p className="mt-6 text-center text-xs text-muted-foreground">Carregando...</p>
      )}

      <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="grad-bg h-2 w-2 rounded-full" /> Pendente
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
  );
}
