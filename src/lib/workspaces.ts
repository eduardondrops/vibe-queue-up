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

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Add protocol if missing so it's a valid URL.
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // Validate it parses as a URL; ignore the result.
    new URL(withProtocol);
    return withProtocol;
  } catch {
    throw new Error(`URL inválida: ${trimmed}`);
  }
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

  const name = input.name?.trim();
  if (!name) throw new Error("Nome do perfil é obrigatório");

  const payload = {
    name,
    avatar_url: input.avatar_url ?? null,
    instagram_url: normalizeUrl(input.instagram_url),
    tiktok_url: normalizeUrl(input.tiktok_url),
    youtube_url: normalizeUrl(input.youtube_url),
    facebook_url: normalizeUrl(input.facebook_url),
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("workspaces")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    console.error("createWorkspace failed", { payload, error });
    throw new Error(error.message || "Erro ao criar workspace");
  }
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
  if (!file.type.startsWith("image/")) {
    throw new Error("O avatar deve ser uma imagem");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Imagem muito grande (máx 5MB)");
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${crypto.randomUUID()}.${ext || "png"}`;
  const { error } = await supabase.storage
    .from("workspace-avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("uploadWorkspaceAvatar failed", error);
    throw new Error(`Falha ao enviar avatar: ${error.message}`);
  }
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
