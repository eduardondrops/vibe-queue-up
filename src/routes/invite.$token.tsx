import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Aceitar convite — PostFlow" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

type InvitationInfo = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_avatar_url: string | null;
  email: string;
  role: "owner" | "editor" | "viewer";
  status: string;
  expires_at: string;
  invited_by_name: string | null;
};

function InvitePage() {
  const { token } = Route.useParams();
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Busca info do convite (público, sem login)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_invitation_by_token", {
        _token: token,
      });
      if (cancel) return;
      if (error) {
        setError(error.message);
      } else if (!data || data.length === 0) {
        setError("Convite não encontrado ou inválido.");
      } else {
        setInfo(data[0] as InvitationInfo);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  // Quando o usuário fica logado E o email bate, aceita automaticamente
  useEffect(() => {
    if (!info || authLoading || !user || accepting) return;
    if ((user.email ?? "").toLowerCase() !== info.email.toLowerCase()) return;
    if (info.status !== "pending") return;

    setAccepting(true);
    (async () => {
      const { data, error } = await supabase.rpc("accept_workspace_invitation", {
        _token: token,
      });
      if (error) {
        toast.error(error.message);
        setAccepting(false);
        return;
      }
      const ws = data?.[0];
      toast.success(`Você entrou em ${ws?.workspace_name ?? "o perfil"}!`);
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId: ws?.workspace_id ?? info.workspace_id },
      });
    })();
  }, [info, user, authLoading, accepting, token, navigate]);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (!info) return;
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(info.email, password, displayName || undefined);
        // Tenta logar imediatamente (caso confirmação de email esteja desativada)
        try {
          await signIn(info.email, password);
        } catch {
          toast.success("Conta criada! Verifique seu email para confirmar e tente novamente.");
        }
      } else {
        await signIn(info.email, password);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="text-xl font-bold">Convite inválido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "Não foi possível carregar este convite."}
          </p>
          <Button onClick={() => navigate({ to: "/" })} className="mt-6">
            Ir para o início
          </Button>
        </div>
      </div>
    );
  }

  const isExpired =
    info.status === "expired" || new Date(info.expires_at).getTime() < Date.now();
  const alreadyAccepted = info.status === "accepted";
  const revoked = info.status === "revoked";

  if (alreadyAccepted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">Convite já aceito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esse convite já foi utilizado.
          </p>
          <Button onClick={() => navigate({ to: "/" })} className="mt-6">
            Ir para o app
          </Button>
        </div>
      </div>
    );
  }

  if (isExpired || revoked) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="text-xl font-bold">
            {revoked ? "Convite revogado" : "Convite expirado"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {revoked
              ? "Quem te convidou cancelou esse acesso."
              : "Esse convite não é mais válido. Peça um novo."}
          </p>
          <Button onClick={() => navigate({ to: "/" })} className="mt-6">
            Ir para o início
          </Button>
        </div>
      </div>
    );
  }

  // Usuário logado MAS com email diferente
  if (user && (user.email ?? "").toLowerCase() !== info.email.toLowerCase()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold">Email diferente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este convite foi enviado para <strong>{info.email}</strong>, mas você está
            logado como <strong>{user.email}</strong>. Saia e entre com a conta correta.
          </p>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="mt-6"
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  // Usuário logado e correto — está sendo processado pelo useEffect
  if (user && accepting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Adicionando você ao perfil...</p>
        </div>
      </div>
    );
  }

  // Não está logado — mostra formulário de signup/signin
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="grad-bg mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-[var(--shadow-glow)]">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Você foi convidado para
          </h1>
          <p className="mt-2 text-lg font-semibold grad-text">{info.workspace_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {info.invited_by_name ? `${info.invited_by_name} te convidou` : "Convite recebido"}{" "}
            como <strong>{info.role}</strong>
          </p>
        </div>

        <form
          onSubmit={handleAuth}
          className="glass space-y-4 rounded-2xl p-6 shadow-[var(--shadow-card)]"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={info.email} disabled />
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="displayName">Seu nome</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como podemos te chamar?"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder={mode === "signup" ? "Crie uma senha" : "Sua senha"}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="grad-bg w-full text-primary-foreground hover:opacity-90"
          >
            {submitting
              ? "Aguarde..."
              : mode === "signup"
                ? "Criar conta e entrar"
                : "Entrar e aceitar"}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signup"
              ? "Já tenho conta — fazer login"
              : "Não tenho conta — criar nova"}
          </button>
        </form>
      </div>
    </div>
  );
}
