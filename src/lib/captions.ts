export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
];

/** CTAs completos por plataforma — frases inteiras, sem substituição quebrada. */
const CTA: Record<Platform, string> = {
  instagram: "Siga o perfil para mais conteúdos como este.",
  tiktok: "Siga o perfil para mais conteúdos como este.",
  youtube: "Se inscreva no canal para mais conteúdos como este.",
  facebook: "Siga a página para acompanhar mais conteúdos como este.",
};

const PLATFORM_TAGS: Record<Platform, string[]> = {
  instagram: ["#reels", "#instareels", "#viral", "#explore", "#fyp"],
  tiktok: ["#fyp", "#foryou", "#viral", "#tiktokbrasil", "#paravoce"],
  youtube: ["#shorts", "#youtubeshorts", "#viral", "#trending"],
  facebook: ["#facebookreels", "#viral", "#trending", "#reels"],
};

/** Merge user hashtags + platform-specific defaults, deduplicated, max 30. */
export function mergeHashtags(userTags: string, platform: Platform): string {
  const normalize = (t: string) => t.trim().replace(/^#+/, "").toLowerCase();

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

/** CTA completo por plataforma (frase inteira). */
export function getCTA(platform: Platform): string {
  return CTA[platform];
}

/**
 * Build a ready-to-paste caption for a given platform.
 * Para YouTube, use buildYouTube em vez disso para ter título separado.
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

/**
 * Estrutura específica do YouTube: título, descrição e hashtags separados.
 * - title: usa ytTitle se existir, senão primeira linha do baseText (até 100 char)
 * - description: ytDescription se existir, senão baseText + CTA
 * - hashtags: merged com defaults do YouTube
 */
export function buildYouTube(args: {
  baseText: string;
  hashtags: string;
  ytTitle?: string;
  ytDescription?: string;
}): { title: string; description: string; hashtags: string } {
  const baseText = (args.baseText || "").trim();
  const cta = CTA.youtube;

  let title = (args.ytTitle || "").trim();
  if (!title) {
    const firstLine = baseText.split("\n")[0]?.trim() ?? "";
    title = firstLine.slice(0, 100);
  }

  let description = (args.ytDescription || "").trim();
  if (!description) {
    description = [baseText, cta].filter(Boolean).join("\n\n");
  }

  const hashtags = mergeHashtags(args.hashtags, "youtube");

  return { title, description, hashtags };
}
