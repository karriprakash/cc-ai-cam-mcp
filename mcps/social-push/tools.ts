import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpModule } from "../_shared/types.js";
import { ok } from "../_shared/result.js";
import { PLATFORMS, normalizeHashtags } from "../_shared/platforms.js";

// Social Push (social-media-content-generator): upload one video, get
// platform-specific titles, captions and hashtags for YouTube, Instagram and
// Facebook. The model writes the copy; these tools hold the rules, validate
// drafts and package the result for the publish step.

const SUPPORTED = ["youtube", "instagram", "facebook"] as const;
type Platform = (typeof SUPPORTED)[number];
const SUPPORTED_VIDEO_FORMATS = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
const MAX_FILE_SIZE_MB = 500;

// Style rules from the repo's content-generation agents.
const STYLE: Record<Platform, { fields: string[]; rules: string[] }> = {
  youtube: {
    fields: ["title", "description", "hashtags"],
    rules: ["SEO-friendly, click-worthy title, max 60 characters.", "Description: hook line, what viewers learn, timestamps if long, call to action.", "3-5 hashtags."],
  },
  instagram: {
    fields: ["caption", "hashtags"],
    rules: ["Short, emoji-rich caption; the first 150 characters must work alone (preview).", "20-30 hashtags, mixing popular and niche."],
  },
  facebook: {
    fields: ["title", "description", "hashtags"],
    rules: ["Conversational, story-style description that invites comments.", "1-3 hashtags."],
  },
};

const post = z.object({
  platform: z.enum(SUPPORTED),
  title: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  hashtags: z.array(z.string()).default([]),
});
type Post = z.infer<typeof post>;

export function validatePost(p: Post) {
  const spec = PLATFORMS[p.platform];
  const errors: string[] = [];
  const warnings: string[] = [];
  const tags = normalizeHashtags(p.hashtags);
  for (const f of STYLE[p.platform].fields) if (f !== "hashtags" && !(p as Record<string, unknown>)[f]) errors.push(`Missing ${f}.`);
  if (p.title && spec.titleMax && p.title.length > spec.titleMax) errors.push(`Title is ${p.title.length} chars; max ${spec.titleMax}.`);
  if (p.platform === "youtube" && p.title && p.title.length > 60) warnings.push(`Title is ${p.title.length} chars; keep under 60 so it isn't truncated.`);
  if (p.caption && spec.captionMax && p.caption.length > spec.captionMax) errors.push(`Caption is ${p.caption.length} chars; max ${spec.captionMax}.`);
  if (p.description && spec.descriptionMax && p.description.length > spec.descriptionMax) errors.push(`Description is ${p.description.length} chars; max ${spec.descriptionMax}.`);
  if (spec.hashtagsMax && tags.length > spec.hashtagsMax) errors.push(`${tags.length} hashtags; max ${spec.hashtagsMax}.`);
  if (spec.hashtagsRecommended) {
    const [lo, hi] = spec.hashtagsRecommended;
    if (tags.length < lo || tags.length > hi) warnings.push(`${tags.length} hashtags; ${lo}-${hi} recommended.`);
  }
  if (p.platform === "instagram" && p.caption && p.caption.length > 150 && !/[.!?\n]/.test(p.caption.slice(0, 150)))
    warnings.push("The first 150 characters don't end a sentence; the preview will cut mid-thought.");
  if (tags.length !== p.hashtags.length) warnings.push("Some hashtags were duplicates or empty and were removed.");
  return { platform: p.platform, valid: errors.length === 0, errors, warnings, hashtags: tags };
}

function createServer(): McpServer {
  const server = new McpServer({ name: "social-push-mcp", version: "0.1.0" });

  server.registerTool("platform_rules", {
    title: "Platform rules",
    description: "Fields, limits and style rules for writing a post on YouTube, Instagram or Facebook. Read before drafting.",
    inputSchema: { platform: z.enum(SUPPORTED) },
  }, async ({ platform }) => ok({ ...STYLE[platform], limits: PLATFORMS[platform] }));

  server.registerTool("check_video_file", {
    title: "Check video file",
    description: `Check a video's type and size against the upload rules (${MAX_FILE_SIZE_MB} MB max).`,
    inputSchema: { mimeType: z.string(), sizeBytes: z.number().int().positive() },
  }, async ({ mimeType, sizeBytes }) => {
    const errors: string[] = [];
    if (!SUPPORTED_VIDEO_FORMATS.includes(mimeType)) errors.push(`${mimeType} isn't supported. Use: ${SUPPORTED_VIDEO_FORMATS.join(", ")}.`);
    if (sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) errors.push(`File is ${(sizeBytes / 1048576).toFixed(0)} MB; max ${MAX_FILE_SIZE_MB} MB.`);
    return ok({ ok: errors.length === 0, errors });
  });

  server.registerTool("normalize_hashtags", {
    title: "Normalize hashtags",
    description: "Clean a hashtag list: add #, strip spaces and punctuation, remove duplicates.",
    inputSchema: { hashtags: z.union([z.array(z.string()), z.string()]) },
  }, async ({ hashtags }) => ok(normalizeHashtags(hashtags)));

  server.registerTool("validate_post", {
    title: "Validate post",
    description: "Check one drafted post against its platform's limits and style rules.",
    inputSchema: post.shape,
  }, async (p) => ok(validatePost(post.parse(p))));

  server.registerTool("build_publish_package", {
    title: "Build publish package",
    description: "Validate drafts for several platforms and return one JSON package for the publish step. Fix every error before publishing.",
    inputSchema: { videoTitle: z.string(), posts: z.array(post).min(1) },
  }, async ({ videoTitle, posts }) => {
    const results = posts.map((p) => ({ ...p, hashtags: normalizeHashtags(p.hashtags), check: validatePost(p) }));
    return ok({
      video: videoTitle,
      readyToPublish: results.every((r) => r.check.valid),
      platforms: Object.fromEntries(results.map(({ check, ...rest }) => [rest.platform, { ...rest, errors: check.errors, warnings: check.warnings }])),
    });
  });

  return server;
}

const mod: McpModule = {
  slug: "social-push",
  title: "Social Push",
  description: "One video, many platforms: rules, validation and a publish package for YouTube, Instagram and Facebook posts.",
  createServer,
  examples: [
    { tool: "normalize_hashtags", args: { hashtags: "#Telugu telugu, #Hyderabad food!! #biryani" } },
    { tool: "validate_post", args: { platform: "instagram", caption: "Best biryani in Hyderabad? We tried 5 spots 🍲", hashtags: ["#biryani", "#hyderabad"] } },
    { tool: "check_video_file", args: { mimeType: "video/mp4", sizeBytes: 120000000 } },
    { tool: "build_publish_package", args: { videoTitle: "Top 5 Biryani", posts: [{ platform: "youtube", title: "Top 5 Hyderabad Biryani Spots", description: "We ranked them.", hashtags: ["#biryani", "#hyderabad", "#food"] }] } },
  ],
};
export default mod;
