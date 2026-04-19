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
    const { supabase, userId } = context;

    // Verifica que o caller é owner do workspace (RLS também aplicará na inserção)
    const { data: isOwner, error: roleErr } = await supabase.rpc("has_workspace_role", {
      _workspace_id: data.workspaceId,
      _user_id: userId,
      _roles: ["owner"],
    });
    if (roleErr || !isOwner) {
      throw new Error("Apenas owners podem convidar membros");
    }

    // Gera token único (URL-safe)
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

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
      throw new Error(insertErr?.message ?? "Falha ao criar convite");
    }

    // Determina URL pública pra montar o redirect
    const origin =
      process.env.PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      "https://vibe-queue-up.lovable.app";
    const redirectTo = `${origin}/invite/${inv.token}`;

    // Verifica se o email já existe no auth (paginação via admin.listUsers)
    let userExists = false;
    try {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      userExists = !!list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === data.email,
      );
    } catch {
      // ignora — em pior caso tentamos sempre o invite
    }

    if (userExists) {
      // Pra usuários existentes, geramos um magic link que leva direto pro /invite/<token>
      const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: data.email,
        options: { redirectTo },
      });
      if (linkErr) {
        throw new Error(`Falha ao enviar email: ${linkErr.message}`);
      }
    } else {
      // Pra novos usuários, dispara o convite oficial do Supabase
      const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        { redirectTo },
      );
      if (invErr) {
        throw new Error(`Falha ao enviar convite: ${invErr.message}`);
      }
    }

    return { ok: true, invitationId: inv.id };
  });
