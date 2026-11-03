import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpModule } from "../_shared/types.js";
import { fail, ok } from "../_shared/result.js";
import { PLATFORMS, PLATFORM_IDS, PLATFORM_LIMITS_AS_OF } from "../_shared/platforms.js";

// OmniVideo (YouTube-AIGO): Telugu + English video studio that exports one
// video to YouTube, Shorts, Reels and TikTok. These tools do the exact math and
// rule checks; the model writes the creative text.

const RATIOS = { "9:16": [9, 16], "16:9": [16, 9], "1:1": [1, 1], "4:5": [4, 5] } as const;
const OUTPUT = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] } as const;

export function reframe(srcW: number, srcH: number, target: keyof typeof RATIOS, focusX = 0.5, focusY = 0.5) {
  const [rw, rh] = RATIOS[target];
  let w = srcW, h = Math.round((srcW * rh) / rw);
  if (h > srcH) { h = srcH; w = Math.round((srcH * rw) / rh); }
  const clamp = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max);
  const x = clamp(focusX * srcW - w / 2, srcW - w);
  const y = clamp(focusY * srcH - h / 2, srcH - h);
  const [outW, outH] = OUTPUT[target];
  return {
    crop: { x, y, width: w, height: h },
    output: { width: outW, height: outH },
    keepsPct: Math.round(((w * h) / (srcW * srcH)) * 100),
    ffmpeg: `-vf "crop=${w}:${h}:${x}:${y},scale=${outW}:${outH}"`,
  };
}

const toSec = (t: string) => t.split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
const toStamp = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(sec).padStart(2, "0")}`;
};

export function checkChapters(chapters: Array<{ time: string; title: string }>, durationSec?: number) {
  const errors: string[] = [];
  const secs = chapters.map((c) => toSec(c.time));
  if (secs[0] !== 0) errors.push("The first chapter must start at 0:00.");
  if (chapters.length < 3) errors.push("YouTube needs at least 3 chapters.");
  for (let i = 1; i < secs.length; i++) {
    if (secs[i] <= secs[i - 1]) errors.push(`Chapter ${i + 1} (${chapters[i].time}) is not after chapter ${i}.`);
    else if (secs[i] - secs[i - 1] < 10) errors.push(`Chapter ${i} is shorter than 10 seconds.`);
  }
  if (durationSec !== undefined && secs.length && durationSec - secs[secs.length - 1] < 10)
    errors.push("The last chapter is shorter than 10 seconds.");
  const block = chapters.map((c, i) => `${toStamp(secs[i])} ${c.title}`).join("\n");
  return { valid: errors.length === 0, errors, descriptionBlock: block };
}

const TELUGU_HOOKS = [
  { topic: "tech", te: "ఇది మీకు తెలుసా? ఇకపై వీడియో ఎడిటింగ్ చాలా సులభం!", en: "Did you know? Video editing just got easy!" },
  { topic: "food", te: "హైదరాబాద్ లో అసలైన దమ్ బిర్యానీ ఎక్కడ దొరుకుతుందో తెలుసా?", en: "Know where to find real dum biryani in Hyderabad?" },
];
const MEME_TEMPLATES = [
  { id: "brahmi_shocked", name: "Brahmanandam Shock", top: "AI Video Editor lo Telugu Support unte..", bottom: "Mundu choopante idi ra!" },
  { id: "ali_reaction", name: "Ali Comedy Reaction", top: "When Video Exports in 4K Instantly", bottom: "Chitti robo kante fast ga undi!" },
  { id: "venky_victory", name: "Venky Victory Smile", top: "100K Views on Telugu Reel", bottom: "Success ra babu!" },
  { id: "tech_geek_mindblown", name: "AI Mind Blown", top: "Voice to Reel in 5 Seconds", bottom: "The Future is OmniVideo!" },
  { id: "social_creator_hype", name: "Viral Creator Hype", top: "YouTube Shorts + Insta Reels", bottom: "Single Click Multi-Format Export!" },
];

function createServer(): McpServer {
  const server = new McpServer({ name: "omnivideo-mcp", version: "0.1.0" });

  server.registerTool("platform_specs", {
    title: "Platform specs",
    description: `Aspect ratio, resolution, max duration and text limits per platform (checked ${PLATFORM_LIMITS_AS_OF}).`,
    inputSchema: { platform: z.enum(PLATFORM_IDS).optional().describe("Omit for all platforms") },
  }, async ({ platform }) => ok(platform ? PLATFORMS[platform] : PLATFORMS));

  server.registerTool("export_plan", {
    title: "Export plan",
    description: "For one source video, list each target platform's trim length, reframe crop and output size, and flag platforms the video is too long for.",
    inputSchema: {
      sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(),
      durationSec: z.number().positive(),
      platforms: z.array(z.enum(PLATFORM_IDS)).min(1),
    },
  }, async ({ sourceWidth, sourceHeight, durationSec, platforms }) => ok(platforms.map((p) => {
    const spec = PLATFORMS[p];
    const ratio = (spec.aspect.startsWith("9:16") ? "9:16" : "16:9") as keyof typeof RATIOS;
    const max = spec.maxDurationSec;
    return {
      platform: spec.name, aspect: ratio,
      trimTo: max && durationSec > max ? max : durationSec,
      needsTrim: !!max && durationSec > max,
      reframe: reframe(sourceWidth, sourceHeight, ratio),
    };
  })));

  server.registerTool("reframe", {
    title: "Reframe crop",
    description: "Compute the crop box (and ffmpeg filter) to convert a video to 9:16, 16:9, 1:1 or 4:5 around a focus point.",
    inputSchema: {
      sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(),
      target: z.enum(["9:16", "16:9", "1:1", "4:5"]),
      focusX: z.number().min(0).max(1).default(0.5).describe("0 = left edge, 1 = right edge"),
      focusY: z.number().min(0).max(1).default(0.5),
    },
  }, async ({ sourceWidth, sourceHeight, target, focusX, focusY }) => ok(reframe(sourceWidth, sourceHeight, target, focusX, focusY)));

  server.registerTool("trim_presets", {
    title: "Trim presets",
    description: "Duration presets used by the OmniVideo studio.",
    inputSchema: {},
  }, async () => ok([
    { id: "reels_15", label: "Reels hook", seconds: 15 },
    { id: "tiktok_30", label: "TikTok", seconds: 30 },
    { id: "shorts_60", label: "Shorts", seconds: 60 },
    { id: "longform", label: "Long-form (no trim)", seconds: null },
  ]));

  server.registerTool("validate_chapters", {
    title: "Validate YouTube chapters",
    description: "Check chapters against YouTube's rules and return the timestamp block for the description.",
    inputSchema: {
      chapters: z.array(z.object({ time: z.string().regex(/^\d{1,2}(:\d{2}){1,2}$/, "Use m:ss or h:mm:ss"), title: z.string().min(1) })).min(1),
      durationSec: z.number().positive().optional(),
    },
  }, async ({ chapters, durationSec }) => ok(checkChapters(chapters, durationSec)));

  server.registerTool("telugu_presets", {
    title: "Telugu hooks and meme templates",
    description: "Starter Telugu hooks and the studio's meme templates (top/bottom text). Use as style examples, then write fresh lines for the user's topic.",
    inputSchema: { kind: z.enum(["hooks", "memes", "all"]).default("all") },
  }, async ({ kind }) => {
    if (kind === "hooks") return ok(TELUGU_HOOKS);
    if (kind === "memes") return ok(MEME_TEMPLATES);
    return ok({ hooks: TELUGU_HOOKS, memes: MEME_TEMPLATES });
  });

  server.registerTool("srt_from_segments", {
    title: "Build SRT captions",
    description: "Turn timed transcript segments (English, Telugu, or both) into an .srt caption file.",
    inputSchema: {
      segments: z.array(z.object({ startSec: z.number().min(0), endSec: z.number().positive(), text: z.string() })).min(1),
    },
  }, async ({ segments }) => {
    const ts = (s: number) => {
      const ms = Math.round(s * 1000);
      const p = (n: number, w = 2) => String(n).padStart(w, "0");
      return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
    };
    const bad = segments.findIndex((s) => s.endSec <= s.startSec);
    if (bad >= 0) return fail(`Segment ${bad + 1} ends before it starts.`);
    return ok(segments.map((s, i) => `${i + 1}\n${ts(s.startSec)} --> ${ts(s.endSec)}\n${s.text}\n`).join("\n"));
  });

  return server;
}

const mod: McpModule = {
  slug: "omnivideo",
  title: "OmniVideo",
  description: "Telugu + English video studio helper: platform specs, export/reframe plans, YouTube chapters, SRT captions, Telugu hooks and meme templates.",
  createServer,
  examples: [
    { tool: "reframe", args: { sourceWidth: 1920, sourceHeight: 1080, target: "9:16" } },
    { tool: "export_plan", args: { sourceWidth: 1920, sourceHeight: 1080, durationSec: 420, platforms: ["youtube", "youtube_shorts", "instagram"] } },
    { tool: "validate_chapters", args: { chapters: [{ time: "0:00", title: "Intro" }, { time: "0:45", title: "Biryani spot #1" }, { time: "3:10", title: "Verdict" }], durationSec: 400 } },
    { tool: "srt_from_segments", args: { segments: [{ startSec: 0, endSec: 2.5, text: "ఇది మీకు తెలుసా?" }] } },
    { tool: "telugu_presets", args: { kind: "hooks" } },
  ],
};
export default mod;
