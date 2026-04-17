import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { appendToQueue } from "@/lib/queue";
import { getMyRole, getWorkspace, type Workspace } from "@/lib/workspaces";
import { Upload, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/w/$workspaceId/upload")({
  head: () => ({
    meta: [
      { title: "Upload — PostFlow" },
      { name: "description", content: "Adicione um vídeo à fila." },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const w = await getWorkspace(workspaceId);
      setWorkspace(w);
      const role = await getMyRole(workspaceId);
      const can = role === "owner" || role === "editor";
      setAllowed(can);
      if (!w || !can) {
        toast.error("Você não tem permissão para enviar neste perfil");
        navigate({ to: "/w/$workspaceId", params: { workspaceId } });
      }
    })();
  }, [workspaceId, user, navigate]);

  if (loading || !user || !workspace || allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <AppShell workspaceId={workspaceId} workspaceName={workspace.name}>
      <UploadForm workspaceId={workspaceId} />
    </AppShell>
  );
}

function UploadForm({ workspaceId }: { workspaceId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [baseText, setBaseText] = useState("");
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
      const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        });
      if (upErr) throw upErr;

      setProgressLabel("Adicionando à fila...");
      await appendToQueue({
        workspaceId,
        storagePath: path,
        baseText: baseText.trim(),
        hashtags: hashtags.trim(),
      });

      toast.success("Vídeo adicionado à fila");
      setFile(null);
      setBaseText("");
      setHashtags("");
      const input = document.getElementById("video-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
      setProgressLabel("");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Upload
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          Adicionar à <span className="grad-text">fila</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1 vídeo por envio. A fila distribui em 3 horários por dia.
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
          <Label htmlFor="baseText">Texto base</Label>
          <Textarea
            id="baseText"
            value={baseText}
            onChange={(e) => setBaseText(e.target.value)}
            rows={3}
            placeholder="Escreva o texto base da legenda..."
            maxLength={2200}
          />
          <p className="text-[11px] text-muted-foreground">
            CTA e hashtags serão adicionados automaticamente por plataforma.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hashtags">Hashtags base</Label>
          <Textarea
            id="hashtags"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            rows={2}
            placeholder="#viral #fyp"
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
