import { useEffect, useState } from "react";
import { Loader2, TrendingUp, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { getPostingHealth, type PostingHealth } from "@/lib/posting-health";

const STATUS_STYLES: Record<
  PostingHealth["status"],
  { wrap: string; icon: string; Icon: typeof TrendingUp; label: string }
> = {
  excellent: {
    wrap: "border-success/40 bg-success/10",
    icon: "text-success",
    Icon: CheckCircle2,
    label: "Excelente",
  },
  good: {
    wrap: "border-primary/40 bg-primary/10",
    icon: "text-primary",
    Icon: TrendingUp,
    label: "Boa",
  },
  warning: {
    wrap: "border-destructive/50 bg-destructive/10",
    icon: "text-destructive",
    Icon: AlertTriangle,
    label: "Atenção",
  },
  idle: {
    wrap: "border-border bg-surface",
    icon: "text-muted-foreground",
    Icon: Sparkles,
    label: "Aguardando",
  },
};

export function PostingHealthCard({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<PostingHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    getPostingHealth(workspaceId)
      .then((h) => {
        if (!cancel) setData(h);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="glass mb-6 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculando saúde da fila...
      </div>
    );
  }
  if (!data) return null;

  const style = STATUS_STYLES[data.status];
  const Icon = style.Icon;

  return (
    <div
      className={`glass mb-6 flex items-start gap-3 rounded-2xl border p-4 shadow-[var(--shadow-card)] ${style.wrap}`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/40 ${style.icon}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-sm font-bold leading-tight">
            {data.message}
          </p>
          <span
            className={`rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.icon}`}
          >
            {style.label}
          </span>
        </div>
        {data.status === "idle" ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Vamos começar a medir sua frequência depois do primeiro post.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {data.postedLast7}/{data.expectedLast7} postados nos últimos 7 dias ativos ·{" "}
            {data.scheduledNext7}/{data.expectedNext7} agendados para os próximos 7
          </p>
        )}
      </div>
    </div>
  );
}
