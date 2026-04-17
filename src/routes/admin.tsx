import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { appendToQueue, recomputeQueue } from "@/lib/queue";
import { Upload, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Upload — ReelQueue" },
      { name: "description", content: "Adicione um vídeo à fila de Reels." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <AppShell>
      <UploadForm />
    </AppShell>
  );
}

function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Selecione um vídeo");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error("Arquivo maior que 200MB");
      return;
    }

    setSubmitting(true);
    try {
      setProgressLabel("Enviando vídeo...");
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        });
      if (upErr) throw upErr;

      setProgressLabel("Adicionando à fila...");
      // Note: video_url is kept for backwards compatibility but is no longer
      // a public URL. Signed URLs are generated on demand when displaying videos.
      await appendToQueue({
        videoUrl: path,
        storagePath: path,
        caption: caption.trim(),
        hashtags: hashtags.trim(),
      });

      // Ensure consistent ordering even if multiple uploads happen
      await recomputeQueue();

      toast.success("Vídeo adicionado à fila");
      setFile(null);
      setCaption("");
      setHashtags("");
      (document.getElementById("video-file") as HTMLInputElement | null) &&
        ((document.getElementById("video-file") as HTMLInputElement).value = "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar";
      toast.error(message);
    } finally {
      setSubmitting(false);
      setProgressLabel("");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          Adicionar à <span className="grad-text">fila</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1 vídeo por envio. A fila distribui automaticamente em 3 horários por dia.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass space-y-5 rounded-2xl p-5 shadow-[var(--shadow-card)]"
      >
        <div className="space-y-2">
          <Label htmlFor="video-file">Vídeo (MP4)</Label>
          <label
            htmlFor="video-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-8 text-center transition-colors hover:border-primary/60"
          >
            {file ? (
              <>
                <Film className="h-8 w-8 text-primary" />
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium">Toque para escolher</div>
                <div className="text-xs text-muted-foreground">MP4, até 200MB</div>
              </>
            )}
          </label>
          <input
            id="video-file"
            type="file"
            accept="video/mp4,video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="caption">Legenda</Label>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            placeholder="Escreva a legenda..."
            maxLength={2200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hashtags">Hashtags</Label>
          <Textarea
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            rows={2}
            placeholder="#reels #viral #fyp"
            maxLength={500}
          />
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full grad-bg text-primary-foreground hover:opacity-90"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {progressLabel || "Enviando..."}
            </>
          ) : (
            "Adicionar à fila"
          )}
        </Button>
      </form>
    </div>
  );
}
