import { supabase } from "@/integrations/supabase/client";

export type Workspace = {
  id: string;
  name: string;
  avatar_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRole = "owner" | "editor" | "viewer";

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Workspace[];
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Workspace | null;
}

export async function createWorkspace(input: {
  name: string;
  avatar_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
}): Promise<Workspace> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name: input.name,
      avatar_url: input.avatar_url ?? null,
      instagram_url: input.instagram_url ?? null,
      tiktok_url: input.tiktok_url ?? null,
      youtube_url: input.youtube_url ?? null,
      facebook_url: input.facebook_url ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Workspace;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Omit<Workspace, "id" | "created_by" | "created_at" | "updated_at">>,
): Promise<void> {
  const { error } = await supabase.from("workspaces").update(patch).eq("id", id);
  if (error) throw error;
}

export async function getMyRole(workspaceId: string): Promise<WorkspaceRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.role as WorkspaceRole | undefined) ?? null;
}

export async function uploadWorkspaceAvatar(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("workspace-avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function getAvatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  // If a full URL was stored, return as-is.
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage
    .from("workspace-avatars")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
