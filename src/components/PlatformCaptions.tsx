import { useState } from "react";
import { Instagram, Music2, Youtube, Facebook } from "lucide-react";
import {
  buildYouTube,
  generateCaption,
  mergeHashtags,
  getCTA,
  PLATFORMS,
  type Platform,
} from "@/lib/captions";
import { CopyButton } from "@/components/CopyButton";

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
  ytTitle,
  ytDescription,
}: {
  baseText: string;
  hashtags: string;
  ytTitle?: string;
  ytDescription?: string;
}) {
  const [active, setActive] = useState<Platform | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Legenda por plataforma
      </p>

      <div className="grid grid-cols-4 gap-2">
        {PLATFORMS.map((p) => {
          const Icon = ICONS[p.id];
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(isActive ? null : p.id)}
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

      {active === "youtube" ? (
        <YouTubeBlock
          baseText={baseText}
          hashtags={hashtags}
          ytTitle={ytTitle}
          ytDescription={ytDescription}
        />
      ) : active ? (
        <SimpleBlock platform={active} baseText={baseText} hashtags={hashtags} />
      ) : null}
    </div>
  );
}

function SimpleBlock({
  platform,
  baseText,
  hashtags,
}: {
  platform: Platform;
  baseText: string;
  hashtags: string;
}) {
  const fullCaption = generateCaption(platform, baseText, hashtags);
  const cta = getCTA(platform);
  const mergedTags = mergeHashtags(hashtags, platform);
  const body = (baseText || "").trim();

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      {/* Bloco completo */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Legenda completa
          </span>
          <CopyButton text={fullCaption} variant="icon" label="Copiar legenda" />
        </div>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
          {fullCaption}
        </pre>
      </div>

      {/* Blocos individuais */}
      {body && <FieldBlock label="Texto base" value={body} />}
      <FieldBlock label="CTA" value={cta} />
      {mergedTags && <FieldBlock label="Hashtags" value={mergedTags} />}
    </div>
  );
}

function YouTubeBlock({
  baseText,
  hashtags,
  ytTitle,
  ytDescription,
}: {
  baseText: string;
  hashtags: string;
  ytTitle?: string;
  ytDescription?: string;
}) {
  const yt = buildYouTube({ baseText, hashtags, ytTitle, ytDescription });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <FieldBlock label="Título" value={yt.title} mono />
      <FieldBlock label="Descrição" value={yt.description} />
      <FieldBlock label="Hashtags" value={yt.hashtags} />
    </div>
  );
}

function FieldBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <CopyButton text={value} variant="icon" label={`Copiar ${label.toLowerCase()}`} />
      </div>
      <pre
        className={`max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground ${
          mono ? "font-medium" : "font-sans"
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
