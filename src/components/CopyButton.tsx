import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Botão de copiar discreto. Mostra "copiado" por 1.2s ao clicar.
 * Variant 'icon' = ícone só (para inline). Variant 'full' = botão com label.
 */
export function CopyButton({
  text,
  label = "Copiar",
  successMessage = "Copiado",
  variant = "icon",
  className = "",
}: {
  text: string;
  label?: string;
  successMessage?: string;
  variant?: "icon" | "full";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(successMessage);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground ${className}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-success" /> Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {label}
        </>
      )}
    </button>
  );
}
