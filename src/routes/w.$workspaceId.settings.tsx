import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMyRole,
  getWorkspace,
  updateWorkspace,
  uploadWorkspaceAvatar,
  getAvatarSignedUrl,
  type Workspace,
} from "@/lib/workspaces";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ImagePlus, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiTokenSection } from "@/components/ApiTokenSection";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";

export const Route = createFileRoute("/w/$workspaceId/settings")({
  head: () => ({
    meta: [
      { title: "Ajustes — PostFlow" },
      { name: "description", content: "Configure o perfil." },
    ],
  }),
  component: SettingsPage,
});

type Member = {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
};

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<"owner" | "editor" | "viewer" | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const w = await getWorkspace(workspaceId);
      const r = await getMyRole(workspaceId);
      setWorkspace(w);
      setRole(r);
      if (!w) navigate({ to: "/" });
    })();
  }, [workspaceId, user, navigate]);

  if (loading || !user || !workspace || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <AppShell workspaceId={workspaceId} workspaceName={workspace.name}>
      <SettingsForm workspace={workspace} role={role} onSaved={(w) => setWorkspace(w)} />
      {role === "owner" && (
        <MembersSection workspaceId={workspace.id} currentUserId={user.id} />
      )}
      <ApiTokenSection userId={user.id} />
    </AppShell>
  );
}

function SettingsForm({
  workspace,
  role,
  onSaved,
}: {
  workspace: Workspace;
  role: "owner" | "editor" | "viewer";
  onSaved: (w: Workspace) => void;
}) {
  const canEdit = role === "owner" || role === "editor";
  const [name, setName] = useState(workspace.name);
  const [instagram, setInstagram] = useState(workspace.instagram_url ?? "");
  const [tiktok, setTiktok] = useState(workspace.tiktok_url ?? "");
  const [youtube, setYoutube] = useState(workspace.youtube_url ?? "");
  const [facebook, setFacebook] = useState(workspace.facebook_url ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancel = false;
    getAvatarSignedUrl(workspace.avatar_url).then((url) => {
      if (!cancel) setAvatarPreview(url);
    });
    return () => {
      cancel = true;
    };
  }, [workspace.avatar_url]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSubmitting(true);
    try {
      let avatar_url = workspace.avatar_url;
      if (avatarFile) {
        avatar_url = await uploadWorkspaceAvatar(avatarFile);
      }
      await updateWorkspace(workspace.id, {
        name: name.trim(),
        avatar_url,
        instagram_url: instagram.trim() || null,
        tiktok_url: tiktok.trim() || null,
        youtube_url: youtube.trim() || null,
        facebook_url: facebook.trim() || null,
      });
      toast.success("Perfil atualizado");
      onSaved({
        ...workspace,
        name: name.trim(),
        avatar_url,
        instagram_url: instagram.trim() || null,
        tiktok_url: tiktok.trim() || null,
        youtube_url: youtube.trim() || null,
        facebook_url: facebook.trim() || null,
      });
      setAvatarFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Ajustes do perfil
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">{workspace.name}</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass space-y-5 rounded-2xl p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center gap-4">
          <div className="grad-bg flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
            {avatarFile ? (
              <img
                src={URL.createObjectURL(avatarFile)}
                alt=""
                className="h-full w-full object-cover"
                width={64}
                height={64}
              />
            ) : avatarPreview ? (
              <img
                src={avatarPreview}
                alt=""
                className="h-full w-full object-cover"
                width={64}
                height={64}
                loading="lazy"
              />
            ) : (
              workspace.name.charAt(0).toUpperCase()
            )}
          </div>
          <label
            htmlFor="ws-avatar-edit"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-4 w-4" /> Trocar avatar
          </label>
          <input
            id="ws-avatar-edit"
            type="file"
            accept="image/*"
            disabled={!canEdit}
            className="hidden"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ws-name-e">Nome</Label>
          <Input
            id="ws-name-e"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ws-ig-e">Instagram</Label>
            <Input
              id="ws-ig-e"
              value={instagram}
              disabled={!canEdit}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-tt-e">TikTok</Label>
            <Input
              id="ws-tt-e"
              value={tiktok}
              disabled={!canEdit}
              onChange={(e) => setTiktok(e.target.value)}
              placeholder="https://tiktok.com/@..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-yt-e">YouTube</Label>
            <Input
              id="ws-yt-e"
              value={youtube}
              disabled={!canEdit}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://youtube.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-fb-e">Facebook</Label>
            <Input
              id="ws-fb-e"
              value={facebook}
              disabled={!canEdit}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="https://facebook.com/..."
            />
          </div>
        </div>

        {canEdit && (
          <Button
            type="submit"
            disabled={submitting}
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        )}
      </form>
    </div>
  );
}

function MembersSection({
  workspaceId,
  currentUserId,
}: {
  workspaceId: string;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [newRole, setNewRole] = useState<"editor" | "viewer">("editor");
  const [adding, setAdding] = useState(false);
  const [lookup, setLookup] = useState<
    | { state: "idle" }
    | { state: "searching" }
    | { state: "found"; userId: string; email: string; displayName: string | null }
    | { state: "not_found" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleSearch() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setLookup({ state: "error", message: "Email inválido" });
      return;
    }
    setLookup({ state: "searching" });
    const { data, error } = await supabase.rpc("find_user_by_email_for_workspace", {
      _workspace_id: workspaceId,
      _email: email,
    });
    if (error) {
      setLookup({ state: "error", message: error.message });
      return;
    }
    const row = (data ?? [])[0];
    if (!row) {
      setLookup({ state: "not_found" });
      return;
    }
    setLookup({
      state: "found",
      userId: row.id,
      email: row.email ?? email,
      displayName: row.display_name,
    });
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("workspace_members")
      .select("id, user_id, role")
      .eq("workspace_id", workspaceId);
    const list = (data ?? []) as Member[];
    setMembers(list);

    if (list.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in(
          "id",
          list.map((m) => m.user_id),
        );
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p) => {
        if (p.email) map[p.id] = p.email;
      });
      setEmails(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [workspaceId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (lookup.state !== "found") return;
    setAdding(true);
    try {
      const { error } = await supabase.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: lookup.userId,
        role: newRole,
      });
      if (error) throw error;
      toast.success(`${lookup.email} adicionado(a)`);
      setInviteEmail("");
      setLookup({ state: "idle" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(memberId: string) {
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
      toast.success("Membro removido");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold">Membros</h2>

      <div className="glass mb-4 space-y-3 rounded-2xl p-4 shadow-[var(--shadow-card)]">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {emails[m.user_id] ?? m.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                </div>
                {m.user_id !== currentUserId && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="glass space-y-3 rounded-2xl p-4 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold">Adicionar membro</p>
        <div className="space-y-2">
          <Label htmlFor="member-email">Email do usuário</Label>
          <div className="flex gap-2">
            <Input
              id="member-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                if (lookup.state !== "idle") setLookup({ state: "idle" });
              }}
              placeholder="pessoa@exemplo.com"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSearch}
              disabled={lookup.state === "searching" || !inviteEmail.trim()}
            >
              {lookup.state === "searching" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A pessoa precisa já ter conta no PostFlow.
          </p>
        </div>

        {lookup.state === "found" && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium">{lookup.displayName ?? lookup.email}</p>
            <p className="text-xs text-muted-foreground">{lookup.email}</p>
          </div>
        )}
        {lookup.state === "not_found" && (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            Nenhum usuário encontrado com este email. Peça para a pessoa criar uma
            conta primeiro.
          </p>
        )}
        {lookup.state === "error" && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {lookup.message}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="member-role">Papel</Label>
          <select
            id="member-role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "editor" | "viewer")}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="editor">Editor — pode enviar e editar</option>
            <option value="viewer">Viewer — apenas visualiza</option>
          </select>
        </div>
        <Button
          type="submit"
          disabled={adding || lookup.state !== "found"}
          className="w-full grad-bg text-primary-foreground hover:opacity-90"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {adding ? "Adicionando..." : "Adicionar"}
        </Button>
      </form>
    </div>
  );
}
