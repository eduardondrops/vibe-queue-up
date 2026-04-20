import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const TZ = "America/Sao_Paulo";

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

function spDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function spWeekday(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[fmt.format(d)] ?? 0;
}

type WsHealth = {
  status: "excellent" | "good" | "warning";
  message: string;
  daysSinceLastPost: number | null;
  postedLast7: number;
  expectedLast7: number;
  scheduledNext7: number;
  expectedNext7: number;
};

async function computeHealthForWorkspace(workspaceId: string): Promise<WsHealth> {
  const { data: sched } = await supabaseAdmin
    .from("workspace_schedule")
    .select("slots, active_weekdays")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const slots = sched?.slots ?? ["10:00", "18:30", "21:00"];
  const activeWeekdays =
    sched?.active_weekdays && sched.active_weekdays.length > 0
      ? sched.active_weekdays
      : [0, 1, 2, 3, 4, 5, 6];
  const slotsPerDay = slots.length || 1;

  const now = new Date();
  const pastKeys = new Set<string>();
  let pastCount = 0;
  for (let i = 7; i >= 1; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    if (activeWeekdays.includes(spWeekday(d))) {
      pastKeys.add(spDayKey(d));
      pastCount++;
    }
  }
  const futureKeys = new Set<string>();
  let futureCount = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (activeWeekdays.includes(spWeekday(d))) {
      futureKeys.add(spDayKey(d));
      futureCount++;
    }
  }

  const sevenAgo = new Date(now.getTime() - 8 * 86400000).toISOString();
  const sevenAhead = new Date(now.getTime() + 8 * 86400000).toISOString();
  const [postedRes, pendingRes, lastPostRes] = await Promise.all([
    supabaseAdmin
      .from("videos")
      .select("posted_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "posted")
      .gte("posted_at", sevenAgo),
    supabaseAdmin
      .from("videos")
      .select("scheduled_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", sevenAhead),
    supabaseAdmin
      .from("videos")
      .select("posted_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "posted")
      .not("posted_at", "is", null)
      .order("posted_at", { ascending: false })
      .limit(1),
  ]);

  let postedLast7 = 0;
  for (const r of postedRes.data ?? []) {
    if (r.posted_at && pastKeys.has(spDayKey(new Date(r.posted_at)))) postedLast7++;
  }
  let scheduledNext7 = 0;
  for (const r of pendingRes.data ?? []) {
    if (r.scheduled_at && futureKeys.has(spDayKey(new Date(r.scheduled_at)))) scheduledNext7++;
  }

  const expectedLast7 = pastCount * slotsPerDay;
  const expectedNext7 = futureCount * slotsPerDay;
  const pastRate = expectedLast7 > 0 ? Math.min(1, postedLast7 / expectedLast7) : 1;
  const futureRate = expectedNext7 > 0 ? Math.min(1, scheduledNext7 / expectedNext7) : 1;
  const score = pastRate * 0.6 + futureRate * 0.4;

  let daysSinceLastPost: number | null = null;
  const lastPostedAt = lastPostRes.data?.[0]?.posted_at;
  if (lastPostedAt) {
    const lastK = spDayKey(new Date(lastPostedAt));
    let count = 0;
    for (let i = 1; i <= 60; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      const k = spDayKey(d);
      if (k <= lastK) break;
      if (activeWeekdays.includes(spWeekday(d))) count++;
    }
    daysSinceLastPost = count;
  }

  let status: WsHealth["status"];
  let message: string;
  if (daysSinceLastPost !== null && daysSinceLastPost >= 2 && score < 0.85) {
    status = "warning";
    message = `Você está há ${daysSinceLastPost} dia${daysSinceLastPost === 1 ? "" : "s"} sem postar nesse perfil`;
  } else if (score >= 0.85) {
    status = "excellent";
    message = "Sua frequência de postagens está excelente";
  } else if (score >= 0.5) {
    status = "good";
    message = "Sua frequência de postagens está boa";
  } else {
    status = "warning";
    message =
      daysSinceLastPost !== null
        ? `Você está há ${daysSinceLastPost} dia${daysSinceLastPost === 1 ? "" : "s"} sem postar nesse perfil`
        : "Sua frequência de postagens está baixa";
  }

  return {
    status,
    message,
    daysSinceLastPost,
    postedLast7,
    expectedLast7,
    scheduledNext7,
    expectedNext7,
  };
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
