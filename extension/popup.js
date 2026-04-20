const API_URL = "https://vibe-queue-up.lovable.app/api/extension/posts-today";

const $ = (id) => document.getElementById(id);

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}
async function saveToken(token) {
  await chrome.storage.local.set({ token, authError: false });
}
async function clearAll() {
  await chrome.storage.local.remove(["token", "lastPosts", "authError", "lastFetch"]);
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

async function fetchPosts(token) {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const res = await fetch(`${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("AUTH");
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function renderPosts(posts) {
  const el = $("posts");
  if (!posts || posts.length === 0) {
    el.innerHTML = '<div class="empty">Nenhum post agendado para hoje</div>';
    return;
  }
  const now = Date.now();
  const nextIdx = posts.findIndex((p) => new Date(p.scheduled_at).getTime() > now);
  el.innerHTML = posts
    .map((p, i) => `
      <div class="post${i === nextIdx ? " next" : ""}">
        <div class="t">${escapeHtml(p.title)}</div>
        <div class="m">${fmtTime(p.scheduled_at)} · ${escapeHtml(p.workspace_name || "")} · ${escapeHtml(p.status)}</div>
      </div>`)
    .join("");
}

const HEALTH_DOT = { excellent: "#22c55e", good: "#3b82f6", warning: "#ef4444" };
function renderWorkspaces(workspaces) {
  const el = $("workspaces");
  if (!el) return;
  if (!workspaces || workspaces.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = workspaces
    .map((w) => `
      <div class="ws">
        <span class="ws-dot" style="background:${HEALTH_DOT[w.status] || "#6b7280"}"></span>
        <div class="ws-body">
          <div class="ws-name">${escapeHtml(w.name)}</div>
          <div class="ws-msg">${escapeHtml(w.message || "")}</div>
        </div>
      </div>`)
    .join("");
}

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = "status" + (kind ? " " + kind : "");
}

function showSetup() {
  $("setup").style.display = "block";
  $("connected").style.display = "none";
  $("setup-status").style.display = "none";
  $("token").value = "";
}
function showConnected() {
  $("setup").style.display = "none";
  $("connected").style.display = "block";
}

async function refresh() {
  const token = await getToken();
  if (!token) return showSetup();
  setStatus("Atualizando...");
  try {
    const { posts } = await fetchPosts(token);
    await chrome.storage.local.set({ lastPosts: posts, lastFetch: Date.now(), authError: false });
    renderPosts(posts);
    setStatus(`${posts.length} post(s) hoje · ${new Date().toLocaleTimeString("pt-BR")}`, "ok");
    chrome.runtime.sendMessage({ type: "RUN_NOW" }).catch(() => {});
  } catch (e) {
    if (e.message === "AUTH") {
      setStatus("Token inválido ou expirado. Edite o token.", "err");
    } else {
      setStatus("Sem conexão — tentaremos novamente em 1 min", "err");
      // mostra cache
      const { lastPosts = [] } = await chrome.storage.local.get("lastPosts");
      renderPosts(lastPosts);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = await getToken();
  if (!token) {
    showSetup();
  } else {
    showConnected();
    refresh();
  }

  $("save").addEventListener("click", async () => {
    const t = $("token").value.trim();
    const s = $("setup-status");
    s.style.display = "block";
    s.className = "status";
    s.textContent = "Validando...";
    if (t.length < 16) {
      s.className = "status err";
      s.textContent = "Token muito curto";
      return;
    }
    try {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const res = await fetch(`${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) throw new Error("Token inválido");
      if (!res.ok) throw new Error("Erro " + res.status);
      await saveToken(t);
      s.className = "status ok";
      s.textContent = "Token salvo com sucesso";
      setTimeout(() => {
        showConnected();
        refresh();
      }, 400);
    } catch (e) {
      s.className = "status err";
      s.textContent = e.message || "Erro";
    }
  });

  $("refresh").addEventListener("click", refresh);
  $("edit").addEventListener("click", async () => {
    const current = await getToken();
    showSetup();
    if (current) $("token").value = current;
  });
  $("disconnect").addEventListener("click", async () => {
    if (!confirm("Desconectar a extensão?")) return;
    await clearAll();
    chrome.runtime.sendMessage({ type: "CLEAR_TOKEN" }).catch(() => {});
    showSetup();
  });
});
