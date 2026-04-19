import { supabase } from "@/integrations/supabase/client";

export type ApiTokenRow = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // url-safe base64
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return "pf_" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getActiveToken(userId: string): Promise<ApiTokenRow | null> {
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, name, created_at, last_used_at, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as ApiTokenRow) ?? null;
}

export async function createToken(userId: string): Promise<{ raw: string; row: ApiTokenRow }> {
  // revoke existing first (defensive — unique index also enforces this)
  await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  const raw = generateRawToken();
  const token_hash = await sha256Hex(raw);

  const { data, error } = await supabase
    .from("api_tokens")
    .insert({ user_id: userId, token_hash, name: "Chrome Extension" })
    .select("id, name, created_at, last_used_at, revoked_at")
    .single();
  if (error) throw error;
  return { raw, row: data as ApiTokenRow };
}

export async function revokeToken(tokenId: string): Promise<void> {
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);
  if (error) throw error;
}
