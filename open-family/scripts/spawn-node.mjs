#!/usr/bin/env node
// Adds a country and/or city to the family and writes each node's own AGENTS.md.
// Usage:
//   node scripts/spawn-node.mjs --country KE --country-name Kenya --city KE-mombasa --city-name Mombasa [--languages sw,en] [--channels call,whatsapp]
//   node scripts/spawn-node.mjs --all            regenerate agents/nodes for every place in family.json
// Options: --file <family.json> --out <dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const file = opt("file", join(ROOT, "family.json"));
const outDir = opt("out", join(ROOT, "agents", "nodes"));
const family = JSON.parse(readFileSync(file, "utf8"));

function writeNode(country, city) {
  const dir = city ? join(outDir, country.id, city.id) : join(outDir, country.id);
  mkdirSync(dir, { recursive: true });
  const lines = city
    ? [
        "---",
        "level: city",
        `node: ${city.id}`,
        `parent: ${country.id}`,
        `languages: [${(city.languages || []).join(", ")}]`,
        `channels: [${(city.channels || []).join(", ")}]`,
        "inherits: agents/city/AGENTS.md",
        "---",
        "",
        `# ${city.name} city node`,
        "",
        `Part of ${country.name}. Follows every rule in \`agents/city/AGENTS.md\`. Its intake agent \`${city.id}/intake\` follows \`agents/intake/AGENTS.md\`.`,
        "",
        "## Local details",
        "",
        `- Languages: ${(city.languages || []).join(", ") || "not set"}`,
        `- Channels: ${(city.channels || []).join(", ") || "not set"}`,
        `- Mentors: ${(city.mentors || []).length} volunteer(s), shared by alias only`,
        `- Sibling cities: ${country.cities.filter((c) => c.id !== city.id).map((c) => c.name).join(", ") || "none yet"}`,
        "",
      ]
    : [
        "---",
        "level: country",
        `node: ${country.id}`,
        `parent: ${family.id}`,
        "inherits: agents/country/AGENTS.md",
        "---",
        "",
        `# ${country.name} country node`,
        "",
        `Child of the ${family.name}. Parent of: ${country.cities.map((c) => c.name).join(", ") || "no cities yet"}.`,
        "",
      ];
  writeFileSync(join(dir, "AGENTS.md"), lines.join("\n"));
  return join(dir, "AGENTS.md");
}

const written = [];
if (argv.includes("--all")) {
  for (const c of family.countries) { written.push(writeNode(c)); for (const city of c.cities) written.push(writeNode(c, city)); }
} else {
  const cid = opt("country");
  if (!cid) { console.error("Give --country <ID> (and optionally --city <ID>), or --all."); process.exit(2); }
  let country = family.countries.find((c) => c.id === cid);
  if (!country) {
    country = { id: cid, name: opt("country-name", cid), cities: [] };
    family.countries.push(country);
  }
  const cityId = opt("city");
  if (cityId) {
    if (country.cities.some((c) => c.id === cityId)) { console.error(`City ${cityId} already exists in ${country.name}.`); process.exit(1); }
    const city = { id: cityId, name: opt("city-name", cityId), languages: (opt("languages", "en") || "").split(","), channels: (opt("channels", "call,voice-note,whatsapp") || "").split(","), mentors: [] };
    country.cities.push(city);
    writeFileSync(file, JSON.stringify(family, null, 2) + "\n");
    // Siblings' files list the new city too.
    for (const c of country.cities) written.push(writeNode(country, c));
  } else {
    writeFileSync(file, JSON.stringify(family, null, 2) + "\n");
  }
  written.push(writeNode(country));
}
for (const w of written) console.log("wrote", w.replace(ROOT + "/", ""));
