// Minimal frontmatter reader for AGENTS.md and SKILL.md files.
// Supports `key: value` and `key: [a, b, c]` lines between leading `---` fences.
import { readFileSync } from "node:fs";

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
    }
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

export function readFrontmatter(path) {
  return parseFrontmatter(readFileSync(path, "utf8"));
}
