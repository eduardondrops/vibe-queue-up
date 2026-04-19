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
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

type LookupState =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; userId: string; email: string; displayName: string | null }
  | { state: "not_found"; email: string }
  | { state: "error"; message: string };

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
  const [workspaceName, setWorkspaceName] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("editor");
      setLookup({ state: "idle" });
      setAdding(false);
      return;
    }
    if (!user) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", workspaceId)
        .maybeSingle();
      if (!cancel) setWorkspaceName(data?.name ?? "");
    })();
    return () => {
      cancel = true;
    };
  }, [open, user, workspaceId]);

  async function handleSearch() {
    const value = email.trim().toLowerCase();
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setLookup({ state: "error", message: "Email inválido" });
      return;
    }
    setLookup({ state: "searching" });
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
      setLookup({ state: "not_found", email: value });
      return;
    }
    setLookup({
      state: "found",
      userId: row.id,
      email: row.email ?? value,
      displayName: row.display_name,
    });
  }

  async function handleAddDirect(e: FormEvent) {
    e.preventDefault();
    if (lookup.state !== "found") return;
    setAdding(true);
    try {
      const { error } = await supabase.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: lookup.userId,
        role,
      });
      if (error) {
        if (error.message.toLowerCase().includes("duplicate")) {
          throw new Error("Esse usuário já é membro deste perfil");
        }
        throw error;
      }
      toast.success(`${lookup.email} adicionado(a)`);
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
          <DialogTitle>Adicionar membro a {workspaceName || "este perfil"}</DialogTitle>
          <DialogDescription>
            A pessoa precisa ter uma conta no PostFlow. Peça para ela se cadastrar em{" "}
            <strong>/auth</strong> e depois busque o email aqui.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAddDirect} className="space-y-4">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                onBlur={() => {
                  if (
                    lookup.state === "idle" &&
                    email.trim() &&
                    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
                  ) {
                    handleSearch();
                  }
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
          </div>

          {lookup.state === "found" && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <div>
                <p className="font-medium">{lookup.displayName ?? lookup.email}</p>
                <p className="text-xs text-muted-foreground">{lookup.email}</p>
              </div>
              <Button
                type="submit"
                disabled={adding}
                className="grad-bg w-full text-primary-foreground hover:opacity-90"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {adding ? "Adicionando..." : "Adicionar ao perfil"}
              </Button>
            </div>
          )}

          {lookup.state === "not_found" && (
            <div className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">{lookup.email}</strong> ainda não tem
              conta. Peça para a pessoa se cadastrar em <strong>/auth</strong> primeiro,
              depois volte aqui e busque o email novamente.
            </div>
          )}

          {lookup.state === "error" && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {lookup.message}
            </p>
          )}

          {lookup.state === "idle" && (
            <p className="text-[11px] text-muted-foreground">
              Digite o email e tecle Enter para buscar.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
