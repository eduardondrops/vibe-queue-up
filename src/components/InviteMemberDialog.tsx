import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

type LookupState =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; userId: string; email: string; displayName: string | null }
  | { state: "not_found" }
  | { state: "error"; message: string };

type OwnedWorkspace = {
  id: string;
  name: string;
};

export function InviteMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onInvited?: () => void;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [lookup, setLookup] = useState<LookupState>({ state: "idle" });
  const [adding, setAdding] = useState(false);
  const [ownedWorkspaces, setOwnedWorkspaces] = useState<OwnedWorkspace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set([workspaceId]));
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("editor");
      setLookup({ state: "idle" });
      setAdding(false);
      setSelectedIds(new Set([workspaceId]));
      return;
    }

    // Busca workspaces onde o usuário atual é owner.
    if (!user) return;
    let cancel = false;
    (async () => {
      setLoadingWorkspaces(true);
      const { data: memberships, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces(id, name)")
        .eq("user_id", user.id)
        .eq("role", "owner");

      if (cancel) return;
      if (error) {
        toast.error("Erro ao carregar perfis");
        setLoadingWorkspaces(false);
        return;
      }
      const list: OwnedWorkspace[] = (memberships ?? [])
        .map((m) => {
          const w = m.workspaces as { id: string; name: string } | null;
          return w ? { id: w.id, name: w.name } : null;
        })
        .filter((x): x is OwnedWorkspace => x !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      setOwnedWorkspaces(list);
      // Garante que o workspace atual está pré-selecionado se o usuário é owner.
      setSelectedIds(
        new Set(list.some((w) => w.id === workspaceId) ? [workspaceId] : []),
      );
      setLoadingWorkspaces(false);
    })();
    return () => {
      cancel = true;
    };
  }, [open, user, workspaceId]);

  function toggleWorkspace(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSearch() {
    const value = email.trim().toLowerCase();
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setLookup({ state: "error", message: "Email inválido" });
      return;
    }
    setLookup({ state: "searching" });
    // Usa o workspace atual como contexto para a busca (a função RPC exige um workspace_id
    // onde o caller seja owner — o que é o caso aqui, pois esse modal só abre para owners).
    const { data, error } = await supabase.rpc("find_user_by_email_for_workspace", {
      _workspace_id: workspaceId,
      _email: value,
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
      email: row.email ?? value,
      displayName: row.display_name,
    });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (lookup.state !== "found") return;
    if (selectedIds.size === 0) {
      toast.error("Selecione pelo menos um perfil");
      return;
    }
    setAdding(true);
    try {
      const targets = Array.from(selectedIds);
      const rows = targets.map((wid) => ({
        workspace_id: wid,
        user_id: lookup.userId,
        role,
      }));
      // Inserção em lote — a RLS valida cada linha individualmente.
      const { error } = await supabase.from("workspace_members").insert(rows);
      if (error) {
        // Tenta detectar duplicidade com mensagem amigável
        if (error.message.toLowerCase().includes("duplicate")) {
          throw new Error("Esse usuário já é membro de um dos perfis selecionados");
        }
        throw error;
      }
      toast.success(
        targets.length === 1
          ? `${lookup.email} adicionado(a)`
          : `${lookup.email} adicionado(a) a ${targets.length} perfis`,
      );
      onInvited?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            A pessoa precisa já ter conta no PostFlow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (lookup.state !== "idle") setLookup({ state: "idle" });
                }}
                placeholder="pessoa@exemplo.com"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSearch}
                disabled={lookup.state === "searching" || !email.trim()}
              >
                {lookup.state === "searching" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {lookup.state === "found" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium">{lookup.displayName ?? lookup.email}</p>
              <p className="text-xs text-muted-foreground">{lookup.email}</p>
            </div>
          )}
          {lookup.state === "not_found" && (
            <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
              Nenhum usuário com esse email. Peça para a pessoa criar conta primeiro.
            </p>
          )}
          {lookup.state === "error" && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {lookup.message}
            </p>
          )}

          <div className="space-y-2">
            <Label>Perfis para compartilhar</Label>
            {loadingWorkspaces ? (
              <div className="flex items-center justify-center rounded-xl border border-border bg-surface py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : ownedWorkspaces.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                Você não é owner de nenhum perfil.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface p-2">
                {ownedWorkspaces.map((w) => {
                  const checked = selectedIds.has(w.id);
                  return (
                    <label
                      key={w.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-primary/5"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleWorkspace(w.id)}
                      />
                      <span className="flex-1 truncate">{w.name}</span>
                      {w.id === workspaceId && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Atual
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Selecione um ou mais perfis para dar acesso de uma vez.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Papel</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="editor">Editor — pode enviar e editar</option>
              <option value="viewer">Viewer — apenas visualiza</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              O mesmo papel será aplicado a todos os perfis selecionados.
            </p>
          </div>

          <Button
            type="submit"
            disabled={
              adding ||
              lookup.state !== "found" ||
              selectedIds.size === 0 ||
              loadingWorkspaces
            }
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {adding
              ? "Adicionando..."
              : selectedIds.size > 1
                ? `Adicionar a ${selectedIds.size} perfis`
                : "Adicionar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
