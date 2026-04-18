import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Look up a user by email. Requires the caller to be an owner of the workspace
 * they're inviting to. Uses the admin client because profiles RLS forbids
 * reading other users' rows.
 */
export const findUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; workspaceId: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    const workspaceId = String(input?.workspaceId ?? "").trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Email inválido");
    }
    if (!workspaceId) throw new Error("Workspace inválido");
    return { email, workspaceId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is owner of the workspace.
    const { data: membership, error: mErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership || membership.role !== "owner") {
      throw new Error("Apenas o owner pode buscar membros");
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .ilike("email", data.email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) return { found: false as const };
    return {
      found: true as const,
      user: {
        id: profile.id,
        email: profile.email,
        display_name: profile.display_name,
      },
    };
  });

export const inviteMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { email: string; workspaceId: string; role: "editor" | "viewer" }) => {
      const email = String(input?.email ?? "").trim().toLowerCase();
      const workspaceId = String(input?.workspaceId ?? "").trim();
      const role = input?.role === "viewer" ? "viewer" : "editor";
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error("Email inválido");
      }
      if (!workspaceId) throw new Error("Workspace inválido");
      return { email, workspaceId, role: role as "editor" | "viewer" };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is owner.
    const { data: membership, error: mErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership || membership.role !== "owner") {
      throw new Error("Apenas o owner pode adicionar membros");
    }

    // Look up user via admin client.
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) {
      throw new Error("Nenhum usuário encontrado com este email. Peça para a pessoa se cadastrar primeiro.");
    }

    // Check if already a member.
    const { data: existing } = await supabaseAdmin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (existing) {
      throw new Error("Este usuário já é membro do workspace");
    }

    // Insert via the user-scoped client so the RLS policy fires correctly
    // (only owners can insert).
    const { error: insertErr } = await supabase.from("workspace_members").insert({
      workspace_id: data.workspaceId,
      user_id: profile.id,
      role: data.role,
    });
    if (insertErr) throw new Error(insertErr.message);

    return { success: true, email: profile.email };
  });
