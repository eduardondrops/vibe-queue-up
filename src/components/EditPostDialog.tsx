import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, Youtube } from "lucide-react";
import { toast } from "sonner";

export type EditablePost = {
  id: string;
  base_text: string;
  caption: string;
  hashtags: string;
  yt_title: string;
  yt_description: string;
};

/**
 * Dialog for editing an existing video's caption, hashtags and YouTube fields.
 * Reuses the same field structure as the upload form for consistency.
 */
export function EditPostDialog({
  open,
  onOpenChange,
  post,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: EditablePost | null;
  onSaved: () => void;
}) {
  const [baseText, setBaseText] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytOpen, setYtOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && post) {
      setBaseText(post.base_text || post.caption || "");
      setHashtags(post.hashtags || "");
      setYtTitle(post.yt_title || "");
      setYtDescription(post.yt_description || "");
      setYtOpen(Boolean(post.yt_title || post.yt_description));
    }
  }, [open, post]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!post) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("videos")
        .update({
          base_text: baseText.trim(),
          caption: baseText.trim(),
          hashtags: hashtags.trim(),
          yt_title: ytTitle.trim(),
          yt_description: ytDescription.trim(),
        })
        .eq("id", post.id);
      if (error) throw error;
      toast.success("Post atualizado");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar post</DialogTitle>
          <DialogDescription>
            Ajuste a legenda, hashtags e campos do YouTube.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="edit-baseText">Texto base</Label>
            <Textarea
              id="edit-baseText"
              value={baseText}
              onChange={(e) => setBaseText(e.target.value)}
              rows={4}
              placeholder="Escreva o texto base da legenda..."
              maxLength={2200}
            />
            <p className="text-[11px] text-muted-foreground">
              CTA e hashtags serão adicionados automaticamente por plataforma.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-hashtags">Hashtags base</Label>
            <Textarea
              id="edit-hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={2}
              placeholder="#viral #fyp"
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              Máximo de 5 hashtags por legenda.
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setYtOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
            >
              <span className="flex items-center gap-2">
                <Youtube className="h-4 w-4 text-[oklch(0.65_0.22_25)]" />
                YouTube — título e descrição
                <span className="text-[10px] font-normal text-muted-foreground">
                  (opcional)
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${ytOpen ? "rotate-180" : ""}`}
              />
            </button>
            {ytOpen && (
              <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ytTitle" className="text-xs">
                    Título do YouTube
                  </Label>
                  <Input
                    id="edit-ytTitle"
                    value={ytTitle}
                    onChange={(e) => setYtTitle(e.target.value)}
                    placeholder="Se vazio, usa a primeira linha do texto base"
                    maxLength={100}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {ytTitle.length}/100
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ytDescription" className="text-xs">
                    Descrição do YouTube
                  </Label>
                  <Textarea
                    id="edit-ytDescription"
                    value={ytDescription}
                    onChange={(e) => setYtDescription(e.target.value)}
                    rows={3}
                    placeholder="Se vazio, usa o texto base + CTA"
                    maxLength={5000}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="grad-bg text-primary-foreground hover:opacity-90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
