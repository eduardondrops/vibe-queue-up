import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — ReelQueue" },
      { name: "description", content: "Acesse sua conta ReelQueue para gerenciar sua fila de Reels." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    navigate({ to: "/" });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        toast.success("Bem-vindo de volta!");
      } else {
        await signUp(email, password, displayName || undefined);
        toast.success("Conta criada! Você já pode entrar.");
        setMode("signin");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao autenticar";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grad-bg flex h-14 w-14 items-center justify-center rounded-2xl shadow-[var(--shadow-glow)]">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Reel<span className="grad-text">Queue</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Entre para gerenciar sua fila"
              : "Crie sua conta — o primeiro acesso é Admin"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass space-y-4 rounded-2xl p-6 shadow-[var(--shadow-card)]"
        >
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="displayName">Nome</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            {submitting ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "Não tem conta? Cadastre-se"
              : "Já tem conta? Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
