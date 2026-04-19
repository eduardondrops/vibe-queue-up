import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound, Copy, Check, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  createToken,
  getActiveToken,
  revokeToken,
  type ApiTokenRow,
} from "@/lib/api-tokens";

export function ApiTokenSection({ userId }: { userId: string }) {
  const [token, setToken] = useState<ApiTokenRow | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await getActiveToken(userId);
        setToken(t);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  async function handleGenerate() {
    setBusy(true);
    try {
      const { raw, row } = await createToken(userId);
      setToken(row);
      setRawToken(raw);
      toast.success("Token gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar token");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!token) return;
    if (!confirm("Revogar o token? A extensão vai parar de funcionar até gerar um novo.")) return;
    setBusy(true);
    try {
      await revokeToken(token.id);
      setToken(null);
      setRawToken(null);
      toast.success("Token revogado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!rawToken) return;
    try {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold">Integração com Extensão Chrome</h2>

      <div className="glass space-y-4 rounded-2xl p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm text-muted-foreground">
          Gere um token para conectar a Extensão Chrome e receber notificações dos seus
          posts do dia. O token é pessoal — não compartilhe.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : !token ? (
          <Button
            onClick={handleGenerate}
            disabled={busy}
            className="grad-bg text-primary-foreground hover:opacity-90"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            Gerar token
          </Button>
        ) : (
          <div className="space-y-3">
            {rawToken ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-primary">
                  Copie agora — não conseguiremos mostrar de novo:
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 truncate rounded-xl border border-border bg-surface px-3 py-2 text-xs">
                    {rawToken}
                  </code>
                  <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                Token ativo desde{" "}
                {new Date(token.created_at).toLocaleDateString("pt-BR")}
                {token.last_used_at && (
                  <>
                    {" · "}último uso{" "}
                    {new Date(token.last_used_at).toLocaleString("pt-BR")}
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleGenerate}
                disabled={busy}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Regenerar
              </Button>
              <Button
                onClick={handleRevoke}
                disabled={busy}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Revogar
              </Button>
            </div>

            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Como usar na extensão
              </summary>
              <div className="mt-2 space-y-1 pl-2">
                <p>1. Abra a extensão PostFlow no Chrome</p>
                <p>2. Cole o token quando solicitado</p>
                <p>
                  3. A extensão vai consultar{" "}
                  <code className="rounded bg-surface px-1">
                    /api/extension/posts-today
                  </code>{" "}
                  e te avisar antes de cada postagem
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
