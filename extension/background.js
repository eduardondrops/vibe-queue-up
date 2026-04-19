// PostFlow Notifier — background service worker (MV3)
const API_URL = "https://vibe-queue-up.lovable.app/api/extension/posts-today";
const POLL_MIN = 5; // poll every 5 min
const POLL_ALARM = "postflow-poll";

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}

async function fetchPosts(token) {
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const res = await fetch(`${API_URL}?tzOffsetMinutes=${tzOffsetMinutes}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function alarmName(postId, kind) {
  return `post:${postId}:${kind}`; // kind = "warn" | "fire"
}

function notifKey(postId, kind, dateIso) {
  return `${postId}:${kind}:${dateIso}`;
}

async function clearAllPostAlarms() {
  const all = await chrome.alarms.getAll();
  for (const a of all) {
    if (a.name.startsWith("post:")) await chrome.alarms.clear(a.name);
  }
}

async function scheduleAlarmsForPosts(posts) {
  await clearAllPostAlarms();
  const now = Date.now();
  for (const p of posts || []) {
    if (p.status === "posted" || p.status === "skipped") continue;
    if (!p.scheduled_at) continue;
    const target = new Date(p.scheduled_at).getTime();
    if (Number.isNaN(target)) continue;

    const warnAt = target - 10 * 60 * 1000;
    if (warnAt > now + 5_000) {
      await chrome.alarms.create(alarmName(p.id, "warn"), { when: warnAt });
    }
    if (target > now + 5_000) {
      await chrome.alarms.create(alarmName(p.id, "fire"), { when: target });
    }
  }
}

async function refreshAndSchedule() {
  const token = await getToken();
  if (!token) {
    await clearAllPostAlarms();
    return;
  }
  try {
    const { posts } = await fetchPosts(token);
    await chrome.storage.local.set({ lastPosts: posts, lastFetch: Date.now() });
    await scheduleAlarmsForPosts(posts);
  } catch (e) {
    console.error("PostFlow refresh failed:", e);
  }
}

async function alreadyNotified(key) {
  const { notifiedKeys = {} } = await chrome.storage.local.get("notifiedKeys");
  return Boolean(notifiedKeys[key]);
}
async function markNotified(key) {
  const { notifiedKeys = {} } = await chrome.storage.local.get("notifiedKeys");
  notifiedKeys[key] = Date.now();
  // garbage collect entries older than 36h
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  for (const k of Object.keys(notifiedKeys)) {
    if (notifiedKeys[k] < cutoff) delete notifiedKeys[k];
  }
  await chrome.storage.local.set({ notifiedKeys });
}

async function showNotification(post, kind) {
  const dateIso = new Date(post.scheduled_at).toISOString().slice(0, 10);
  const key = notifKey(post.id, kind, dateIso);
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

  await chrome.notifications.create(`pf-${key}`, {
    type: "basic",
    iconUrl: "icon.png",
    title,
    message,
    priority: 2,
    requireInteraction: kind === "fire",
  });
  await markNotified(key);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM) {
    await refreshAndSchedule();
    return;
  }
  if (alarm.name.startsWith("post:")) {
    const [, postId, kind] = alarm.name.split(":");
    const { lastPosts = [] } = await chrome.storage.local.get("lastPosts");
    const post = lastPosts.find((p) => p.id === postId);
    if (post) await showNotification(post, kind);
  }
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.tabs.create({ url: "https://vibe-queue-up.lovable.app/" });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "RESCHEDULE_ALARMS") {
    refreshAndSchedule().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function ensurePollAlarm() {
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!existing) {
    await chrome.alarms.create(POLL_ALARM, {
      delayInMinutes: 0.5,
      periodInMinutes: POLL_MIN,
    });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensurePollAlarm();
  await refreshAndSchedule();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensurePollAlarm();
  await refreshAndSchedule();
});
