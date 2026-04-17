export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
];

const CTA: Record<Platform, string> = {
  instagram: "Segue o perfil pra mais conteúdo como esse 💜",
  tiktok: "Segue o perfil pra não perder nenhum vídeo 🔥",
  youtube: "Se inscreva no canal e ative o sininho 🔔",
  facebook: "Siga a página pra ver mais como esse 👍",
};

const PLATFORM_TAGS: Record<Platform, string[]> = {
  instagram: ["#reels", "#instareels", "#viral", "#explore", "#fyp"],
  tiktok: ["#fyp", "#foryou", "#viral", "#tiktokbrasil", "#paravoce"],
  youtube: ["#shorts", "#youtubeshorts", "#viral", "#trending"],
  facebook: ["#facebookreels", "#viral", "#trending", "#reels"],
};

/** Merge user hashtags + platform-specific defaults, deduplicated, max 30. */
function mergeHashtags(userTags: string, platform: Platform): string {
  const normalize = (t: string) =>
    t.trim().replace(/^#+/, "").toLowerCase();

  const userList = (userTags || "")
    .split(/[\s,]+/)
    .map(normalize)
    .filter(Boolean);

  const platformList = PLATFORM_TAGS[platform].map(normalize);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...userList, ...platformList]) {
    if (!seen.has(tag)) {
      seen.add(tag);
      merged.push(`#${tag}`);
    }
  }
  return merged.slice(0, 30).join(" ");
}

/**
 * Build a ready-to-paste caption for a given platform using the video's
 * baseText (caption) and hashtags as the source of truth.
 */
export function generateCaption(
  platform: Platform,
  baseText: string,
  hashtags: string,
): string {
  const body = (baseText || "").trim();
  const cta = CTA[platform];
  const tags = mergeHashtags(hashtags, platform);

  return [body, cta, tags].filter(Boolean).join("\n\n");
}
