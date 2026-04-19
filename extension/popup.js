const API_URL = "https://vibe-queue-up.lovable.app/api/extension/posts-today";

const $ = (id) => document.getElementById(id);

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}

async function saveToken(token) {
  await chrome.storage.local.set({ token });
}

async function clearToken() {
  await chrome.storage.local.remove(["token", "lastPosts", "notifiedKeys"]);
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function fetchPosts(token) {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const url = `${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("Token inválido ou revogado");
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

function renderPosts(posts) {
  const el = $("posts");
  if (!posts || posts.length === 0) {
    el.innerHTML = '<div class="empty">Nenhum post agendado para hoje</div>';
    return;
  }
  el.innerHTML = posts
    .map(
      (p) => `
      <div class="post">
        <div class="t">${escapeHtml(p.title)}</div>
        <div class="m">${fmtTime(p.scheduled_at)} · ${escapeHtml(p.workspace_name || "")} · ${p.status}</div>
      </div>`,
    )
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = "status" + (kind ? " " + kind : "");
}

async function refresh() {
  const token = await getToken();
  if (!token) return showSetup();
  setStatus("Atualizando...");
  try {
    const { posts } = await fetchPosts(token);
    await chrome.storage.local.set({ lastPosts: posts, lastFetch: Date.now() });
    renderPosts(posts);
    setStatus(`${posts.length} post(s) hoje · atualizado ${new Date().toLocaleTimeString("pt-BR")}`, "ok");
    chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
  } catch (e) {
    setStatus(e.message || "Erro", "err");
  }
}

function showSetup() {
  $("setup").style.display = "block";
  $("connected").style.display = "none";
}
function showConnected() {
  $("setup").style.display = "none";
  $("connected").style.display = "block";
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
    try {
      // validate by hitting the API
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const res = await fetch(`${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) throw new Error("Token inválido");
      if (!res.ok) throw new Error("Erro " + res.status);
      await saveToken(t);
      s.className = "status ok";
      s.textContent = "Conectado!";
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
  $("disconnect").addEventListener("click", async () => {
    await clearToken();
    chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
    showSetup();
  });
});
