import { supabase } from "@/integrations/supabase/client";

export type AdminMembership = {
  workspace_id: string;
  workspace_name: string;
  workspace_avatar_url: string | null;
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  role: "owner" | "editor" | "viewer" | null;
  joined_at: string | null;
};

export type AdminWorkspaceGroup = {
  workspace_id: string;
  workspace_name: string;
  workspace_avatar_url: string | null;
  members: Array<{
    user_id: string;
    user_email: string | null;
    user_display_name: string | null;
    role: "owner" | "editor" | "viewer";
    joined_at: string;
  }>;
};

export async function isSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) {
    console.error("isSuperAdmin failed", error);
    return false;
  }
  return Boolean(data);
}

export async function listAllMemberships(): Promise<AdminWorkspaceGroup[]> {
  const { data, error } = await supabase.rpc("admin_list_all_memberships");
  if (error) throw error;
  const rows = (data ?? []) as AdminMembership[];

  const map = new Map<string, AdminWorkspaceGroup>();
  for (const r of rows) {
    let group = map.get(r.workspace_id);
    if (!group) {
      group = {
        workspace_id: r.workspace_id,
        workspace_name: r.workspace_name,
        workspace_avatar_url: r.workspace_avatar_url,
        members: [],
      };
      map.set(r.workspace_id, group);
    }
    if (r.user_id && r.role) {
      group.members.push({
        user_id: r.user_id,
        user_email: r.user_email,
        user_display_name: r.user_display_name,
        role: r.role,
        joined_at: r.joined_at ?? "",
      });
    }
  }
  return Array.from(map.values());
}
