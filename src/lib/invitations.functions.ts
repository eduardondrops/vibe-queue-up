import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface CreateInvitationInput {
  workspaceId: string;
  email: string;
  role: "editor" | "viewer";
}

/**
 * Cria um convite e dispara o email de convite via Supabase Auth Admin.
 * - Se a pessoa não tem conta: o email do Supabase a leva pra criar conta e
 *   depois redireciona pra /invite/<token> onde o membership é gravado.
 * - Se já tem conta: o email leva direto pra /invite/<token>.
 */
export const createWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateInvitationInput) => {
    if (!input.workspaceId) throw new Error("workspaceId obrigatório");
    const email = (input.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email inválido");
    if (!["editor", "viewer"].includes(input.role)) throw new Error("Papel inválido");
    return { workspaceId: input.workspaceId, email, role: input.role };
  })
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId } = context;

      // Verifica que o caller é owner do workspace (RLS também aplicará na inserção)
      const { data: isOwner, error: roleErr } = await supabase.rpc(
        "has_workspace_role",
        {
          _workspace_id: data.workspaceId,
          _user_id: userId,
          _roles: ["owner"],
        },
      );
      if (roleErr) {
        console.error("[invitation] role check error:", roleErr);
        throw new Error(`Falha ao validar permissão: ${roleErr.message}`);
      }
      if (!isOwner) {
        throw new Error("Apenas owners podem convidar membros");
      }

      // Gera token único (URL-safe)
      const token =
        crypto.randomUUID().replace(/-/g, "") +
        crypto.randomUUID().replace(/-/g, "");

      // Cria registro do convite (usa o cliente do usuário pra respeitar RLS)
      const { data: inv, error: insertErr } = await supabase
        .from("workspace_invitations")
        .insert({
          workspace_id: data.workspaceId,
          email: data.email,
          role: data.role,
          token,
          invited_by: userId,
        })
        .select("id, token")
        .single();

      if (insertErr || !inv) {
        console.error("[invitation] insert error:", insertErr);
        throw new Error(insertErr?.message ?? "Falha ao criar convite");
      }

      // Determina URL pública pra montar o redirect
      const origin =
        process.env.PUBLIC_APP_URL ||
        process.env.SITE_URL ||
        "https://vibe-queue-up.lovable.app";
      const redirectTo = `${origin}/invite/${inv.token}`;

      // Tenta enviar email de convite. Se o usuário já existe, o Supabase
      // retorna erro — nesse caso caímos pra magic link.
      const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        { redirectTo },
      );

      if (invErr) {
        const msg = (invErr.message || "").toLowerCase();
        const userAlreadyExists =
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("exists");

        if (userAlreadyExists) {
          // Usuário já tem conta — dispara magic link
          const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: data.email,
            options: { redirectTo },
          });
          if (linkErr) {
            console.error("[invitation] magic link error:", linkErr);
            throw new Error(`Falha ao enviar email: ${linkErr.message}`);
          }
        } else {
          console.error("[invitation] invite error:", invErr);
          throw new Error(`Falha ao enviar convite: ${invErr.message}`);
        }
      }

      return { ok: true, invitationId: inv.id };
    } catch (e) {
      // Garante que sempre retornamos um Error serializável (não um Response)
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Erro inesperado ao enviar convite";
      console.error("[invitation] handler failed:", e);
      throw new Error(message);
    }
  });
