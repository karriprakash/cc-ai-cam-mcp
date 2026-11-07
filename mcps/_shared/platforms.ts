/**
 * Publishing limits per platform. These change; `asOf` says when they were
 * last checked. Tools surface them so the model writes within the limits.
 */
export const PLATFORM_LIMITS_AS_OF = "2025";

export interface PlatformSpec {
  id: string;
  name: string;
  aspect: string;
  resolution: string;
  maxDurationSec?: number;
  titleMax?: number;
  captionMax?: number;
  descriptionMax?: number;
  hashtagsMax?: number;
  hashtagsRecommended?: [number, number];
  notes: string[];
}

export const PLATFORMS: Record<string, PlatformSpec> = {
  youtube: {
    id: "youtube", name: "YouTube (long-form)", aspect: "16:9", resolution: "1920x1080",
    titleMax: 100, descriptionMax: 5000, hashtagsMax: 15, hashtagsRecommended: [3, 5],
    notes: ["Keep the title under ~60 characters so it isn't cut off in search.", "Chapters: first at 0:00, at least 3, each at least 10 seconds."],
  },
  youtube_shorts: {
    id: "youtube_shorts", name: "YouTube Shorts", aspect: "9:16", resolution: "1080x1920", maxDurationSec: 180,
    titleMax: 100, descriptionMax: 5000, hashtagsMax: 15, hashtagsRecommended: [2, 3],
    notes: ["Hook in the first 1-2 seconds.", "Add #Shorts to the title or description."],
  },
  instagram: {
    id: "instagram", name: "Instagram Reels", aspect: "9:16", resolution: "1080x1920", maxDurationSec: 180,
    captionMax: 2200, hashtagsMax: 30, hashtagsRecommended: [5, 30],
    notes: ["Only ~125-150 characters show before 'more': put the hook first."],
  },
  tiktok: {
    id: "tiktok", name: "TikTok", aspect: "9:16", resolution: "1080x1920", maxDurationSec: 600,
    captionMax: 4000, hashtagsRecommended: [3, 6],
    notes: ["3-second hook decides retention.", "Search keywords in the caption help discovery."],
  },
  facebook: {
    id: "facebook", name: "Facebook", aspect: "16:9 or 9:16 (Reels)", resolution: "1920x1080 / 1080x1920",
    titleMax: 255, descriptionMax: 63206, hashtagsRecommended: [1, 3],
    notes: ["Short, conversational descriptions perform better than long ones."],
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as [string, ...string[]];

/** Normalizes hashtags: adds '#', strips spaces/punctuation, dedupes case-insensitively. */
export function normalizeHashtags(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const body = r.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!body) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push("#" + body);
  }
  return out;
}
