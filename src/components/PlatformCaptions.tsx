import { useState } from "react";
import { Copy, Check, Instagram, Music2, Youtube, Facebook } from "lucide-react";
import { toast } from "sonner";
import {
  generateCaption,
  PLATFORMS,
  type Platform,
} from "@/lib/captions";
import { Button } from "@/components/ui/button";

const ICONS: Record<Platform, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  facebook: Facebook,
};

const ACCENT: Record<Platform, string> = {
  instagram:
    "bg-gradient-to-tr from-[oklch(0.65_0.22_15)] via-[oklch(0.62_0.24_350)] to-[oklch(0.65_0.2_60)] text-white",
  tiktok: "bg-black text-white",
  youtube: "bg-[oklch(0.55_0.22_25)] text-white",
  facebook: "bg-[oklch(0.5_0.18_255)] text-white",
};

export function PlatformCaptions({
  baseText,
  hashtags,
}: {
  baseText: string;
  hashtags: string;
}) {
  const [active, setActive] = useState<Platform | null>(null);
  const [copied, setCopied] = useState(false);

  const caption = active ? generateCaption(active, baseText, hashtags) : "";

  async function handleCopy() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      toast.success("Legenda copiada");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Legenda por plataforma
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {PLATFORMS.map((p) => {
          const Icon = ICONS[p.id];
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActive(p.id);
                setCopied(false);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition-all ${
                isActive
                  ? `${ACCENT[p.id]} border-transparent shadow-[var(--shadow-card)]`
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={isActive}
            >
              <Icon className="h-4 w-4" />
              {p.label}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
            {caption}
          </pre>
          <Button
            type="button"
            onClick={handleCopy}
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Copiado
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" /> Copiar legenda
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
