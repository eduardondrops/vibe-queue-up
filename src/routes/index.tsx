import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createWorkspace,
  getAvatarSignedUrl,
  listWorkspaces,
  uploadWorkspaceAvatar,
  type Workspace,
} from "@/lib/workspaces";
import {
  Plus,
  Instagram,
  Music2,
  Youtube,
  Facebook,
  Sparkles,
  LogOut,
  X,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Perfis — PostFlow" },
      { name: "description", content: "Escolha um perfil para gerenciar." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grad-bg flex h-8 w-8 items-center justify-center rounded-xl shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Post<span className="grad-text">Flow</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <WorkspacesList />
      </main>
    </div>
  );
}

function WorkspacesList() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await listWorkspaces();
      setWorkspaces(list);
      const entries = await Promise.all(
        list.map(async (w) => [w.id, await getAvatarSignedUrl(w.avatar_url)] as const),
      );
      setAvatars(Object.fromEntries(entries));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Seus perfis
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          Escolha um <span className="grad-text">workspace</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada perfil tem sua própria fila e calendário.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground">Carregando...</p>
      ) : workspaces.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem nenhum perfil.
          </p>
          <Button
            onClick={() => setShowCreate(true)}
            className="mt-4 grad-bg text-primary-foreground hover:opacity-90"
          >
            <Plus className="mr-1 h-4 w-4" /> Criar primeiro perfil
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <WorkspaceCard key={w.id} workspace={w} avatarUrl={avatars[w.id] ?? null} />
          ))}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="glass flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-muted-foreground transition-all hover:border-primary/60 hover:text-foreground"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Novo perfil</span>
          </button>
        </div>
      )}

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  avatarUrl,
}: {
  workspace: Workspace;
  avatarUrl: string | null;
}) {
  const initial = workspace.name.trim().charAt(0).toUpperCase() || "?";
  const socials: Array<{
    href: string | null;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    cls: string;
  }> = [
    {
      href: workspace.instagram_url,
      icon: Instagram,
      label: "Instagram",
      cls: "from-[oklch(0.65_0.22_15)] via-[oklch(0.62_0.24_350)] to-[oklch(0.65_0.2_60)]",
    },
    { href: workspace.tiktok_url, icon: Music2, label: "TikTok", cls: "from-black to-black" },
    {
      href: workspace.youtube_url,
      icon: Youtube,
      label: "YouTube",
      cls: "from-[oklch(0.55_0.22_25)] to-[oklch(0.55_0.22_25)]",
    },
    {
      href: workspace.facebook_url,
      icon: Facebook,
      label: "Facebook",
      cls: "from-[oklch(0.5_0.18_255)] to-[oklch(0.5_0.18_255)]",
    },
  ];

  return (
    <div className="glass group relative flex flex-col gap-4 rounded-2xl p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]">
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId: workspace.id }}
        className="flex items-center gap-3"
      >
        <div className="grad-bg flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={workspace.name}
              className="h-full w-full object-cover"
              loading="lazy"
              width={56}
              height={56}
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{workspace.name}</p>
          <p className="text-xs text-muted-foreground">Abrir agenda</p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {socials.map((s) =>
          s.href ? (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.cls} text-white shadow-sm transition-transform hover:scale-110`}
            >
              <s.icon className="h-4 w-4" />
            </a>
          ) : (
            <span
              key={s.label}
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground/40"
            >
              <s.icon className="h-4 w-4" />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [facebook, setFacebook] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome ao perfil");
      return;
    }
    setSubmitting(true);
    try {
      let avatarPath: string | null = null;
      if (avatar) {
        try {
          avatarPath = await uploadWorkspaceAvatar(avatar);
        } catch (err) {
          // Don't block creation if avatar fails — warn and continue.
          console.error("avatar upload failed, continuing without it", err);
          toast.warning(
            err instanceof Error
              ? `Avatar não enviado: ${err.message}`
              : "Avatar não enviado",
          );
        }
      }
      await createWorkspace({
        name: name.trim(),
        avatar_url: avatarPath,
        instagram_url: instagram.trim() || null,
        tiktok_url: tiktok.trim() || null,
        youtube_url: youtube.trim() || null,
        facebook_url: facebook.trim() || null,
      });
      toast.success("Perfil criado");
      onCreated();
    } catch (e) {
      console.error("createWorkspace error", e);
      toast.error(e instanceof Error ? e.message : "Erro ao criar perfil");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="glass w-full max-w-lg overflow-hidden rounded-t-2xl shadow-[var(--shadow-card)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-bold">Novo perfil</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="ws-avatar">Avatar (opcional)</Label>
            <label
              htmlFor="ws-avatar"
              className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface px-3 py-3 text-sm transition-colors hover:border-primary/60"
            >
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {avatar ? avatar.name : "Toque para escolher"}
              </span>
            </label>
            <input
              id="ws-avatar"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-name">Nome do perfil</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Padre, Bruxa Mística"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ws-ig">Instagram</Label>
              <Input
                id="ws-ig"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-tt">TikTok</Label>
              <Input
                id="ws-tt"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="https://tiktok.com/@..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-yt">YouTube</Label>
              <Input
                id="ws-yt"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-fb">Facebook</Label>
              <Input
                id="ws-fb"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/..."
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...
              </>
            ) : (
              "Criar perfil"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
