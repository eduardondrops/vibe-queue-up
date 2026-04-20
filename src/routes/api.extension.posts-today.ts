import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/extension/posts-today")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const match = auth.match(/^Bearer\s+(.+)$/i);
          if (!match) {
            return jsonResponse({ error: "Missing Bearer token" }, 401);
          }
          const rawToken = match[1].trim();
          if (rawToken.length < 16 || rawToken.length > 256) {
            return jsonResponse({ error: "Invalid token format" }, 401);
          }
          const tokenHash = await sha256Hex(rawToken);

          const { data: userIdData, error: validateErr } = await supabaseAdmin.rpc(
            "validate_api_token",
            { _token_hash: tokenHash },
          );
          if (validateErr || !userIdData) {
            return jsonResponse({ error: "Invalid or revoked token" }, 401);
          }
          const userId = userIdData as string;

          // Get workspaces the user belongs to
          const { data: memberships, error: memErr } = await supabaseAdmin
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId);
          if (memErr) {
            return jsonResponse({ error: "Failed to load workspaces" }, 500);
          }
          const wsIds = (memberships ?? []).map((m) => m.workspace_id);
          if (wsIds.length === 0) {
            return jsonResponse({ posts: [] });
          }

          // Day window in user's local TZ via header (fallback UTC)
          const url = new URL(request.url);
          const tzOffsetParam = url.searchParams.get("tzOffsetMinutes");
          const offsetMin = tzOffsetParam ? Number(tzOffsetParam) : 0;
          const now = new Date();
          // local "now" approximation
          const localNow = new Date(now.getTime() - offsetMin * 60_000);
          const startLocal = new Date(
            Date.UTC(
              localNow.getUTCFullYear(),
              localNow.getUTCMonth(),
              localNow.getUTCDate(),
              0,
              0,
              0,
            ),
          );
          const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);
          // shift back to UTC for the query
          const startUtc = new Date(startLocal.getTime() + offsetMin * 60_000);
          const endUtc = new Date(endLocal.getTime() + offsetMin * 60_000);

          const { data: videos, error: vErr } = await supabaseAdmin
            .from("videos")
            .select(
              "id, yt_title, base_text, scheduled_at, status, workspace_id",
            )
            .in("workspace_id", wsIds)
            .gte("scheduled_at", startUtc.toISOString())
            .lt("scheduled_at", endUtc.toISOString())
            .order("scheduled_at", { ascending: true });
          if (vErr) {
            return jsonResponse({ error: "Failed to load posts" }, 500);
          }

          // Workspace names lookup
          const { data: workspaces } = await supabaseAdmin
            .from("workspaces")
            .select("id, name")
            .in("id", wsIds);
          const wsMap = new Map(
            (workspaces ?? []).map((w) => [w.id, w.name]),
          );

          const posts = (videos ?? []).map((v) => {
            const title =
              (v.yt_title || "").trim() ||
              (v.base_text || "").trim().slice(0, 80) ||
              "Post sem título";
            return {
              id: v.id,
              title,
              scheduled_at: v.scheduled_at,
              status: v.status,
              workspace_id: v.workspace_id,
              workspace_name: wsMap.get(v.workspace_id) ?? "",
            };
          });

          // Compute posting health per workspace (server-side).
          const workspacesHealth = await Promise.all(
            wsIds.map(async (wid) => {
              const h = await computeHealthForWorkspace(wid);
              return { id: wid, name: wsMap.get(wid) ?? "", ...h };
            }),
          );

          return jsonResponse({ posts, workspaces: workspacesHealth });
        } catch (err) {
          console.error("posts-today error:", err);
          return jsonResponse({ error: "Internal error" }, 500);
        }
      },
    },
  },
});
