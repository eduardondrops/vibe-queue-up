import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  isSuperAdmin,
  listAllMemberships,
  type AdminWorkspaceGroup,
} from "@/lib/admin";
import { getAvatarSignedUrl } from "@/lib/workspaces";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Users,
  Crown,
  Pencil,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — PostFlow" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<AdminWorkspaceGroup[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    setBusy(true);
    isSuperAdmin()
      .then(async (ok) => {
        if (cancel) return;
        setAllowed(ok);
        if (!ok) return;
        try {
          const data = await listAllMemberships();
          if (cancel) return;
          setGroups(data);
          const entries = await Promise.all(
            data.map(
              async (g) =>
                [g.workspace_id, await getAvatarSignedUrl(g.workspace_avatar_url)] as const,
            ),
          );
          if (!cancel) setAvatars(Object.fromEntries(entries));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar dados");
        }
      })
      .finally(() => !cancel && setBusy(false));
    return () => {
      cancel = true;
    };
  }, [user]);

  if (loading || !user || busy) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Este painel é exclusivo do administrador da plataforma.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    );
  }

  const totalMembers = new Set(
    groups.flatMap((g) => g.members.map((m) => m.user_id)),
  ).size;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-display text-sm font-semibold">Admin</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Painel administrativo
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold">
            Membros & <span className="grad-text">permissões</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length} {groups.length === 1 ? "workspace" : "workspaces"} ·{" "}
            {totalMembers} {totalMembers === 1 ? "pessoa única" : "pessoas únicas"}
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-card)]">
            Nenhum workspace encontrado.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <WorkspaceMemberCard
                key={g.workspace_id}
                group={g}
                avatarUrl={avatars[g.workspace_id] ?? null}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function WorkspaceMemberCard({
  group,
  avatarUrl,
}: {
  group: AdminWorkspaceGroup;
  avatarUrl: string | null;
}) {
  const initial = group.workspace_name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="glass rounded-2xl p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="grad-bg flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-primary-foreground">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={group.workspace_name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">
            {group.workspace_name}
          </p>
          <p className="text-xs text-muted-foreground">
            <Users className="mr-1 inline h-3 w-3" />
            {group.members.length} {group.members.length === 1 ? "membro" : "membros"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/w/$workspaceId" params={{ workspaceId: group.workspace_id }}>
            Abrir
          </Link>
        </Button>
      </div>

      {group.members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-3 text-xs text-muted-foreground">
          Sem membros (apenas o criador inicial pode ter sido removido).
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {group.members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 bg-surface/40 px-3 py-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                {(m.user_display_name || m.user_email || "?")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.user_display_name || "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.user_email || m.user_id}
                </p>
              </div>
              <RoleBadge role={m.role} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: "owner" | "editor" | "viewer" }) {
  if (role === "owner") {
    return (
      <Badge className="gap-1 bg-accent/15 text-accent-foreground hover:bg-accent/20">
        <Crown className="h-3 w-3" /> Owner
      </Badge>
    );
  }
  if (role === "editor") {
    return (
      <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
        <Pencil className="h-3 w-3" /> Editor
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Eye className="h-3 w-3" /> Viewer
    </Badge>
  );
}
