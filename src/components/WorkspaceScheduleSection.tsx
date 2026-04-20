import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, Clock, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getWorkspaceSchedule,
  updateWorkspaceSlots,
} from "@/lib/workspace-schedule";
import { recomputeQueue } from "@/lib/queue";

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS = [
  { value: 0, label: "D", full: "Domingo" },
  { value: 1, label: "S", full: "Segunda" },
  { value: 2, label: "T", full: "Terça" },
  { value: 3, label: "Q", full: "Quarta" },
  { value: 4, label: "Q", full: "Quinta" },
  { value: 5, label: "S", full: "Sexta" },
  { value: 6, label: "S", full: "Sábado" },
];

function normalizeTime(input: string): string | null {
  const trimmed = input.trim();
  const m = TIME_RE.exec(trimmed);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function WorkspaceScheduleSection({
  workspaceId,
  canEdit,
}: {
  workspaceId: string;
  canEdit: boolean;
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    getWorkspaceSchedule(workspaceId)
      .then((s) => {
        if (!cancel) {
          setSlots(s.slots);
          setActiveDays(s.active_weekdays);
        }
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [workspaceId]);

  function addSlot() {
    if (!canEdit) return;
    const norm = normalizeTime(draft);
    if (!norm) {
      toast.error("Use o formato HH:MM (ex: 09:30)");
      return;
    }
    if (slots.includes(norm)) {
      toast.error("Esse horário já está na lista");
      return;
    }
    const next = [...slots, norm].sort((a, b) => a.localeCompare(b));
    setSlots(next);
    setDraft("");
  }

  function removeSlot(s: string) {
    if (!canEdit) return;
    setSlots((curr) => curr.filter((x) => x !== s));
  }

  function toggleDay(day: number) {
    if (!canEdit) return;
    setActiveDays((curr) =>
      curr.includes(day) ? curr.filter((d) => d !== day) : [...curr, day].sort(),
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (slots.length === 0) {
      toast.error("Adicione pelo menos um horário");
      return;
    }
    if (activeDays.length === 0) {
      toast.error("Selecione pelo menos um dia ativo");
      return;
    }
    setSaving(true);
    try {
      await updateWorkspaceSlots(workspaceId, slots, activeDays);
      // Recompute the queue immediately so existing pending videos get
      // redistributed across the new slot set.
      await recomputeQueue(workspaceId);
      toast.success("Estratégia atualizada e fila reorganizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="font-display text-xl font-bold">Estratégia de postagem</h2>
        <p className="text-xs text-muted-foreground">
          Defina quantos posts por dia e em quais horários (fuso de São Paulo).
          Mudar isso reorganiza automaticamente os vídeos pendentes.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="glass space-y-5 rounded-2xl p-5 shadow-[var(--shadow-card)]"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <div>
              <Label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Horários ({slots.length} {slots.length === 1 ? "post" : "posts"} por dia)
              </Label>
              {slots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-3 text-xs text-muted-foreground">
                  Nenhum horário configurado. Adicione abaixo.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <li
                      key={s}
                      className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
                    >
                      <span>{s}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeSlot(s)}
                          className="rounded-md p-0.5 text-muted-foreground hover:text-destructive"
                          aria-label={`Remover ${s}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canEdit && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ws-slot-new" className="text-xs">
                    Adicionar horário (HH:MM)
                  </Label>
                  <Input
                    id="ws-slot-new"
                    type="time"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="12:00"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSlot}
                  disabled={!draft}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </div>
            )}

            <div className="border-t border-border/50 pt-4">
              <Label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Dias ativos ({activeDays.length}/7)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = activeDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      disabled={!canEdit}
                      title={d.full}
                      aria-pressed={active}
                      className={`h-9 w-9 rounded-lg border text-sm font-bold transition-all ${
                        active
                          ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_0_2px_oklch(0.68_0.26_358/0.15)]"
                          : "border-border bg-surface text-muted-foreground hover:border-border/80"
                      } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                Usado apenas para calcular a saúde da sua frequência de postagem.
                Não afeta o agendamento automático dos vídeos.
              </p>
            </div>

            {canEdit && (
              <Button
                type="submit"
                disabled={saving || slots.length === 0 || activeDays.length === 0}
                className="w-full grad-bg text-primary-foreground hover:opacity-90"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando e reorganizando fila...
                  </>
                ) : (
                  "Salvar estratégia"
                )}
              </Button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
