import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, slotLabelForDate } from "@/lib/scheduling";
import { markPosted, skipVideo, type QueueVideo } from "@/lib/queue";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Copy,
  Download,
  Check,
  SkipForward,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/day/$date")({
  head: ({ params }) => ({
    meta: [
      { title: `Vídeos do dia ${params.date} — ReelQueue` },
      { name: "description", content: "Lista de vídeos agendados para o dia." },
    ],
  }),
  component: DayPage,
});

function DayPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { date } = Route.useParams();

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
      <DayList dateKey={date} />
    </AppShell>
  );
}

function DayList({ dateKey: dKey }: { dateKey: string }) {
  const [videos, setVideos] = useState<QueueVideo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [y, m, d] = dKey.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);

    const { data, error } = await supabase
      .from("videos")
      .select(
        "id, video_url, storage_path, caption, hashtags, status, queue_position, scheduled_at, created_at",
      )
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

    // Generate short-lived signed URLs (1h TTL) for the private bucket.
    const urls: Record<string, string> = {};
    await Promise.all(
      list.map(async (v) => {
        const { data: signed } = await supabase.storage
          .from("videos")
          .createSignedUrl(v.storage_path, 3600);
        if (signed?.signedUrl) urls[v.id] = signed.signedUrl;
      }),
    );
    setSignedUrls(urls);
    setLoading(false);
  }, [dKey]);

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
      await skipVideo(id);
      toast.success("Vídeo movido para o fim da fila");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiada`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Calendário
      </Link>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Agenda do dia
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold capitalize">
          {dateLabel}
        </h1>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground">Carregando...</p>
      ) : videos.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Nenhum vídeo agendado neste dia.
        </p>
      ) : (
        <div className="space-y-4">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              playbackUrl={signedUrls[v.id] ?? ""}
              busy={busyId === v.id}
              onPosted={() => handlePosted(v.id)}
              onSkip={() => handleSkip(v.id)}
              onCopy={copy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({
  video,
  playbackUrl,
  busy,
  onPosted,
  onSkip,
  onCopy,
}: {
  video: QueueVideo;
  playbackUrl: string;
  busy: boolean;
  onPosted: () => void;
  onSkip: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const time = video.scheduled_at ? slotLabelForDate(video.scheduled_at) : "--:--";
  const statusBadge = {
    pending: { label: "Pendente", cls: "grad-bg text-primary-foreground" },
    posted: { label: "Postado", cls: "bg-success text-success-foreground" },
    skipped: { label: "Pulado", cls: "bg-muted text-muted-foreground" },
  }[video.status];

  return (
    <article className="glass overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold">{time}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>
        </div>
        <a
          href={playbackUrl}
          download
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" /> Baixar
        </a>
      </div>

      <video
        src={playbackUrl}
        controls
        playsInline
        preload="metadata"
        className="aspect-[9/16] w-full bg-black"
      />

      <div className="space-y-3 p-4">
        {video.caption && (
          <button
            onClick={() => onCopy(video.caption, "Legenda")}
            className="group flex w-full items-start gap-2 rounded-lg bg-surface p-3 text-left text-sm hover:bg-surface-elevated"
          >
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            <span className="line-clamp-3">{video.caption}</span>
          </button>
        )}
        {video.hashtags && (
          <button
            onClick={() => onCopy(video.hashtags, "Hashtags")}
            className="group flex w-full items-start gap-2 rounded-lg bg-surface p-3 text-left text-sm hover:bg-surface-elevated"
          >
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            <span className="line-clamp-2 text-primary">{video.hashtags}</span>
          </button>
        )}

        {video.status === "pending" && (
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
        )}
      </div>
    </article>
  );
}
