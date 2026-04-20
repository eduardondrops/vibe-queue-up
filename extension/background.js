// PostFlow Notifier — background service worker (MV3)
// Estratégia: 1 alarme recorrente a cada 1 min faz polling + checagem de janelas.
// - Janela "warn":  -10min < diff <= -9min  (10 minutos antes)
// - Janela "fire":   -1min < diff <=  0min  (na hora exata)
// De-dup persistente em chrome.storage por (postId + kind + dia).

const APP_ORIGIN = "https://vibe-queue-up.lovable.app";
const API_URL = `${APP_ORIGIN}/api/extension/posts-today`;
const POLL_ALARM = "postflow-poll";
const POLL_PERIOD_MIN = 1;

// Mutex simples para evitar execuções concorrentes
let runLock = false;

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}
async function clearToken() {
  await chrome.storage.local.remove("token");
}

async function fetchPosts(token) {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const res = await fetch(`${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return res;
}

function dayKey(iso) {
  // Usa data local do navegador
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function notifKey(postId, kind, iso) {
  return `${postId}:${kind}:${dayKey(iso)}`;
}

async function alreadyNotified(key) {
  const { notifiedKeys = {} } = await chrome.storage.local.get("notifiedKeys");
  return Boolean(notifiedKeys[key]);
}
async function markNotified(key) {
  const { notifiedKeys = {} } = await chrome.storage.local.get("notifiedKeys");
  notifiedKeys[key] = Date.now();
  // GC: remove entradas com mais de 36h
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  for (const k of Object.keys(notifiedKeys)) {
    if (notifiedKeys[k] < cutoff) delete notifiedKeys[k];
  }
  await chrome.storage.local.set({ notifiedKeys });
}

async function showAuthErrorNotification() {
  const key = "auth-error";
  if (await alreadyNotified(key)) return;
  await chrome.notifications.create("pf-auth-error", {
    type: "basic",
    iconUrl: "icon.png",
    title: "PostFlow — Token inválido",
    message: "Token inválido ou expirado. Reconecte sua extensão.",
    priority: 2,
    requireInteraction: true,
  });
  await markNotified(key);
}

async function showPostNotification(post, kind) {
  const key = notifKey(post.id, kind, post.scheduled_at);
  if (await alreadyNotified(key)) return;

  const time = new Date(post.scheduled_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const ws = post.workspace_name ? ` · ${post.workspace_name}` : "";
  const title = kind === "warn" ? "Post em 10 minutos" : "É a hora de postar!";
  const message =
    kind === "warn"
      ? `"${post.title}" às ${time}${ws}`
      : `"${post.title}" — agendado para ${time}${ws}`;

  const notifId = `pf:${post.workspace_id}:${dayKey(post.scheduled_at)}:${post.id}:${kind}`;
  await chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: "icon.png",
    title,
    message,
    priority: 2,
    requireInteraction: kind === "fire",
  });
  await markNotified(key);
}

function checkWindows(post, nowMs) {
  if (!post.scheduled_at) return [];
  if (post.status === "posted" || post.status === "skipped") return [];
  const target = new Date(post.scheduled_at).getTime();
  if (Number.isNaN(target)) return [];
  const diffMin = (target - nowMs) / 60_000; // positivo = futuro

  const fires = [];
  // Aviso: entre 9 e 10 minutos antes
  if (diffMin > 9 && diffMin <= 10) fires.push("warn");
  // Hora exata: entre 0 e 1 minuto após
  if (diffMin > -1 && diffMin <= 0) fires.push("fire");
  return fires;
}

async function runCycle() {
  if (runLock) return;
  runLock = true;
  try {
    const token = await getToken();
    if (!token) return;

    let res;
    try {
      res = await fetchPosts(token);
    } catch (e) {
      // Erro de rede — silencioso, tenta no próximo ciclo
      console.warn("PostFlow: fetch failed", e);
      return;
    }

    if (res.status === 401) {
      await showAuthErrorNotification();
      // Mantém o token salvo para o usuário ver/editar; status fica visível no popup
      await chrome.storage.local.set({ authError: true, lastFetch: Date.now() });
      return;
    }
    if (!res.ok) {
      console.warn("PostFlow: HTTP", res.status);
      return;
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      return;
    }
    const posts = Array.isArray(payload?.posts) ? payload.posts : [];
    const workspaces = Array.isArray(payload?.workspaces) ? payload.workspaces : [];
    await chrome.storage.local.set({
      lastPosts: posts,
      lastWorkspaces: workspaces,
      lastFetch: Date.now(),
      authError: false,
    });

    const now = Date.now();
    for (const p of posts) {
      const kinds = checkWindows(p, now);
      for (const kind of kinds) {
        await showPostNotification(p, kind);
      }
    }

    // Low-frequency warning: 1x per workspace per day
    for (const w of workspaces) {
      if (w.status === "warning") {
        await showHealthWarning(w);
      }
    }
  } finally {
    runLock = false;
  }
}

async function showHealthWarning(ws) {
  const today = new Date();
  const dayK = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const key = `health:${ws.id}:${dayK}`;
  if (await alreadyNotified(key)) return;
  const notifId = `pf-health:${ws.id}:${dayK}`;
  await chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: "icon.png",
    title: `⚠️ ${ws.name || "Workspace"}`,
    message: ws.message || "Sua frequência de postagens está baixa",
    priority: 2,
    requireInteraction: false,
  });
  await markNotified(key);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) runCycle();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "RUN_NOW") {
    runCycle().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === "CLEAR_TOKEN") {
    clearToken().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.notifications.onClicked.addListener(async (id) => {
  // id formats:
  //   pf:<workspaceId>:<YYYY-MM-DD>:<postId>:<kind>
  //   pf-health:<workspaceId>:<YYYY-MM-DD>
  //   pf-auth-error
  let url = APP_ORIGIN + "/";
  if (id.startsWith("pf:")) {
    const parts = id.split(":");
    const workspaceId = parts[1];
    const date = parts[2];
    if (workspaceId && date) {
      url = `${APP_ORIGIN}/w/${workspaceId}/day/${date}`;
    }
  } else if (id.startsWith("pf-health:")) {
    const parts = id.split(":");
    const workspaceId = parts[1];
    if (workspaceId) {
      url = `${APP_ORIGIN}/w/${workspaceId}/upload`;
    }
  }
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

async function ensurePollAlarm() {
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!existing) {
    await chrome.alarms.create(POLL_ALARM, {
      delayInMinutes: 0.1,
      periodInMinutes: POLL_PERIOD_MIN,
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensurePollAlarm();
  await runCycle();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensurePollAlarm();
  await runCycle();
});
