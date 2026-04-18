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

type LookupState =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "found"; userId: string; email: string; displayName: string | null }
  | { state: "not_found" }
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [lookup, setLookup] = useState<LookupState>({ state: "idle" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("editor");
      setLookup({ state: "idle" });
      setAdding(false);
    }
  }, [open]);

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
    setAdding(true);
    try {
      const { error } = await supabase.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: lookup.userId,
        role,
      });
      if (error) throw error;
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
      <DialogContent className="max-w-md">
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

          <Button
            type="submit"
            disabled={adding || lookup.state !== "found"}
            className="w-full grad-bg text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {adding ? "Adicionando..." : "Adicionar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
