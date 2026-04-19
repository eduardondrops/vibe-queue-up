import { useEffect, useRef, useState } from "react";
import { Play, X, RotateCcw, Loader2, Film } from "lucide-react";

/**
 * Preview do vídeo no upload.
 * - Gera URL local com URL.createObjectURL e libera ao desmontar.
 * - Mostra primeiro frame congelado (preload metadata + seek 0.1s).
 * - Botão play sobreposto. Botões remover / substituir.
 */
export function VideoPreview({
  file,
  onRemove,
  onReplace,
}: {
  file: File;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setLoaded(false);
    setError(null);
    setPlaying(false);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    // Tenta posicionar em 0.1s para garantir que o frame apareça (alguns navegadores ignoram preload em frame 0).
    try {
      v.currentTime = 0.1;
    } catch {
      // ignore
    }
    setLoaded(true);
  }

  function handlePlayToggle() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => undefined);
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  const sizeLabel = `${(file.size / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="relative aspect-[9/16] w-full bg-black">
        {url && !error && (
          <video
            ref={videoRef}
            src={url}
            preload="metadata"
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onError={() => setError("Não foi possível carregar o vídeo")}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="h-full w-full object-contain"
          />
        )}

        {!loaded && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Carregando preview…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center text-destructive">
            <Film className="h-8 w-8" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {loaded && !error && !playing && (
          <button
            type="button"
            onClick={handlePlayToggle}
            aria-label="Reproduzir preview"
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30"
          >
            <span className="grad-bg flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)]">
              <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
            </span>
          </button>
        )}

        {loaded && !error && playing && (
          <button
            type="button"
            onClick={handlePlayToggle}
            aria-label="Pausar preview"
            className="absolute inset-0"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-[11px] text-muted-foreground">{sizeLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReplace}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Trocar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
          >
            <X className="h-3 w-3" /> Remover
          </button>
        </div>
      </div>
    </div>
  );
}
