import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, slotLabelForDate } from "@/lib/scheduling";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calendário — ReelQueue" },
      { name: "description", content: "Veja os Reels agendados de cada dia." },
    ],
  }),
  component: IndexPage,
});

type DaySummary = {
  total: number;
  pending: number;
  posted: number;
  nextTime?: string;
};

function IndexPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <AppShell>
      <Calendar />
    </AppShell>
  );
}

function Calendar() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [byDay, setByDay] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);

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
      start.setDate(start.getDate() - start.getDay()); // grid start
      const end = new Date(lastDay);
      end.setDate(end.getDate() + (6 - end.getDay()));
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("videos")
        .select("id, status, scheduled_at")
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
  }, [cursor.getFullYear(), cursor.getMonth()]);

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

  const todayKey = dayKey(new Date());

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
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

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
          const isToday = k === todayKey;
          const isPast = k < todayKey;
          const hasItems = summary && summary.total > 0;
          const clickable = hasItems && inMonth && !isPast;

          const baseClasses =
            "relative flex aspect-square flex-col items-center justify-start rounded-xl border p-1.5 text-xs transition-all";

          let stateClasses = "";
          if (!inMonth) {
            stateClasses = "border-transparent bg-transparent text-muted-foreground/40";
          } else if (isToday) {
            // HOJE — verde Instagram close friends
            stateClasses =
              "border-success/60 bg-success text-success-foreground ring-2 ring-success/70 ring-offset-2 ring-offset-background shadow-[0_8px_24px_-8px_oklch(0.72_0.18_155/0.6)]";
          } else if (isPast) {
            stateClasses =
              "border-border/40 bg-muted/40 text-muted-foreground opacity-50 cursor-not-allowed";
          } else {
            // Futuro
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
            <Link key={k} to="/day/$date" params={{ date: k }}>
              {cell}
            </Link>
          ) : (
            <div key={k}>{cell}</div>
          );
        })}
      </div>

      {loading && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Carregando...
        </p>
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
    </div>
  );
}
