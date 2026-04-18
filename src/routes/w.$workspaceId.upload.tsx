import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { appendToQueue } from "@/lib/queue";
import { getMyRole, getWorkspace, type Workspace } from "@/lib/workspaces";
import {
  SLOTS,
  dayKey,
  slotKey,
  spWallToUtc,
  todayKey,
} from "@/lib/scheduling";
import { Upload, Film, Loader2, CalendarClock } from "lucide-react";
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

type SlotChoice = "auto" | string; // "auto" or ISO of slot

function UploadForm({ workspaceId }: { workspaceId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [baseText, setBaseText] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");

  // Date picker (SP day key, e.g. "2026-04-19")
  const [dayChoice, setDayChoice] = useState<string>(todayKey());
  const [slotChoice, setSlotChoice] = useState<SlotChoice>("auto");
  const [takenKeys, setTakenKeys] = useState<Set<string>>(new Set());

  // Build day options: today + next 30 days.
  const dayOptions = useMemo(() => {
    const today = new Date();
    const out: Array<{ key: string; label: string }> = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = dayKey(d);
      const label = d.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      });
      out.push({ key, label: i === 0 ? `Hoje · ${label}` : label });
    }
    return out;
  }, []);

  // Reload taken slots whenever day changes.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const [y, m, d] = dayChoice.split("-").map(Number);
      const start = new Date(y, m - 1, d, 0, 0, 0, 0);
      const end = new Date(y, m - 1, d, 23, 59, 59, 999);
      const { data } = await supabase
        .from("videos")
        .select("scheduled_at, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString());
      if (cancel) return;
      const set = new Set<string>();
      (data ?? []).forEach((v) => {
        if (v.scheduled_at) set.add(slotKey(v.scheduled_at));
      });
      setTakenKeys(set);
      // Reset slot if previously selected slot is now taken.
      setSlotChoice("auto");
    })();
    return () => {
      cancel = true;
    };
  }, [dayChoice, workspaceId]);

  // Slot options for the selected day.
  const slotOptions = useMemo(() => {
    const [y, m, d] = dayChoice.split("-").map(Number);
    const now = new Date();
    return SLOTS.map((s) => {
      const iso = spWallToUtc(y, m, d, s.h, s.m).toISOString();
      const k = slotKey(iso);
      const isPast = new Date(iso).getTime() <= now.getTime();
      const isTaken = takenKeys.has(k);
      return {
        iso,
        label: s.label,
        disabled: isPast || isTaken,
        reason: isPast ? "Horário já passou" : isTaken ? "Slot ocupado" : "",
      };
    });
  }, [dayChoice, takenKeys]);

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
      const pinnedAt = slotChoice === "auto" ? null : slotChoice;
      await appendToQueue({
        workspaceId,
        storagePath: path,
        baseText: baseText.trim(),
        hashtags: hashtags.trim(),
        pinnedAt,
      });

      toast.success(
        pinnedAt ? "Vídeo agendado no slot escolhido" : "Vídeo adicionado à fila",
      );
      setFile(null);
      setBaseText("");
      setHashtags("");
      setSlotChoice("auto");
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
          Escolha o dia e o horário, ou deixe a fila decidir.
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
          <Label className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Dia
          </Label>
          <select
            value={dayChoice}
            onChange={(e) => setDayChoice(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            {dayOptions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Horário</Label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSlotChoice("auto")}
              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all ${
                slotChoice === "auto"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              Auto
            </button>
            {slotOptions.map((s) => (
              <button
                key={s.iso}
                type="button"
                disabled={s.disabled}
                onClick={() => setSlotChoice(s.iso)}
                title={s.reason}
                className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all ${
                  s.disabled
                    ? "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground/50"
                    : slotChoice === s.iso
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-surface text-foreground hover:border-primary/60"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Auto = próximo slot livre. Escolher fixa o vídeo nesse horário.
          </p>
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
