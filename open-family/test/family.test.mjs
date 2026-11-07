import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildFamily, FAMILY_FILE } from "../runtime/family.mjs";
import { allocateShares } from "../tools/shares.mjs";
import { Ledger } from "../tools/ledger.mjs";
import { redact, findPII } from "../tools/redact.mjs";
import { readFrontmatter } from "../runtime/frontmatter.mjs";
import { ClaudeBrain, RuleBrain } from "../runtime/brain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KAKINADA_IDEA = "A WhatsApp voice helpline where rural women in self-help groups learn Java skills in Telugu from volunteer mentors, so they can return to a career after a break.";
const NAIROBI_IDEA = "WhatsApp voice lessons where rural women in self-help groups learn coding skills from volunteer mentors so they can return to a career.";
const fresh = () => buildFamily({ brain: new RuleBrain(), salt: "test-salt" });

test("routing: a city reaches a city in another country through both countries and the council", () => {
  const { bus } = fresh();
  assert.deepEqual(bus.path("IN-kakinada", "KE-nairobi"), ["IN-kakinada", "IN", "global", "KE", "KE-nairobi"]);
});

test("routing: sibling cities talk through their shared country", () => {
  const { bus } = fresh();
  assert.deepEqual(bus.path("IN-kakinada", "IN-hyderabad"), ["IN-kakinada", "IN", "IN-hyderabad"]);
});

test("parents observe messages that pass through them", async () => {
  const fam = fresh();
  await fam.bus.send({ from: "IN-kakinada", to: "IN-hyderabad", type: "help.request", payload: { field: "robotics" } });
  assert.ok(fam.agent("IN").seen.some((s) => s.type === "help.request"));
  assert.equal(fam.agent("IN-kakinada").offers[0].offer[0].alias, "mentor-hy-1");
});

test("privacy: a contributor's phone number never leaves her city's intake agent", async () => {
  const fam = fresh();
  const phone = "+91 90000 00001";
  await fam.intake("IN-kakinada").accept({ channel: "voice-note", contact: phone, text: `${KAKINADA_IDEA} Call me on ${phone} or mail priya.test@gmail.com` });
  for (const m of fam.bus.transcript) {
    assert.equal(findPII(JSON.stringify(m.payload)).length, 0, `${m.type} from ${m.from} carried personal data`);
  }
  const vault = [...fam.intake("IN-kakinada").vault.values()];
  assert.equal(vault[0].contact, phone);
  assert.equal(fam.root.ledger.entries.length, 1);
});

test("guardian: an upward message with personal data is blocked and the council is alerted", async () => {
  const fam = fresh();
  const r = await fam.bus.send({ from: "IN-hyderabad", to: "IN", type: "idea.review", payload: { note: "call 9000000002" } });
  assert.equal(r.delivered, false);
  assert.equal(fam.root.alerts.length, 1);
  assert.ok(!JSON.stringify(fam.root.alerts).includes("9000000002"), "alert must not repeat the personal data");
});

test("fair shares: points do not depend on submission order", async () => {
  const run = async (order) => {
    const fam = fresh();
    for (const [city, contact, text] of order) await fam.intake(city).accept({ channel: "whatsapp", contact, text });
    return Object.fromEntries(fam.root.ledger.entries.map((e) => [e.city, e.points]));
  };
  const a = ["IN-kakinada", "+91 90000 00001", KAKINADA_IDEA];
  const b = ["KE-nairobi", "+254 700 000001", NAIROBI_IDEA];
  assert.deepEqual(await run([a, b]), await run([b, a]));
});

test("fair shares: no time input is accepted", () => {
  assert.throws(() => allocateShares({ womenImpact: 1, feasibility: 1, clarity: 1 }, 0, new Date()), /time-based inputs are not allowed/);
});

test("fair shares: an existing market idea is scored as an enhancement and still earns points", () => {
  const s = allocateShares({ womenImpact: 0.8, feasibility: 0.6, clarity: 0.7 }, 0.6);
  assert.equal(s.mode, "enhancement");
  assert.ok(s.points > 0);
});

test("joint family: similar ideas in different countries are introduced to each other", async () => {
  const fam = fresh();
  await fam.intake("IN-kakinada").accept({ channel: "voice-note", contact: "+91 90000 00001", text: KAKINADA_IDEA });
  await fam.intake("KE-nairobi").accept({ channel: "whatsapp", contact: "+254 700 000001", text: NAIROBI_IDEA });
  assert.ok(fam.intake("IN-kakinada").outbox.some((o) => o.text.includes("Nairobi, Kenya")));
  assert.ok(fam.intake("KE-nairobi").outbox.some((o) => o.text.includes("Kakinada, India")));
});

test("announcements reach every intake agent", async () => {
  const fam = fresh();
  await fam.root.announce("hello family");
  for (const a of fam.bus.agents.values()) if (a.level === "intake") assert.ok(a.inbox.some((m) => m.type === "family.announce"), a.id);
});

test("ledger: hash chain detects an edited entry", () => {
  const l = new Ledger();
  l.append({ contributor: "c_a", points: 10 });
  l.append({ contributor: "c_b", points: 20 });
  assert.equal(l.verify().ok, true);
  l.entries[0].points = 99;
  assert.deepEqual(l.verify(), { ok: false, brokenAt: 0 });
});

test("tool permissions come from AGENTS.md", () => {
  const fam = fresh();
  assert.throws(() => fam.intake("IN-kakinada").tool("allocateShares", {}, 0), /not allowed/);
  assert.throws(() => fam.agent("IN").tool("marketCheck", "x"), /not allowed/);
  assert.equal(typeof fam.root.tool("marketCheck", "women safety").score, "number");
});

test("every skill named in an AGENTS.md exists and has a name and description", () => {
  for (const level of ["global", "country", "city", "intake"]) {
    const { data } = readFrontmatter(join(ROOT, "agents", level, "AGENTS.md"));
    for (const s of data.skills) {
      const p = join(ROOT, "skills", s, "SKILL.md");
      assert.ok(existsSync(p), `missing ${p}`);
      const fm = readFrontmatter(p).data;
      assert.equal(fm.name, s);
      assert.ok(fm.description?.length > 10);
    }
  }
});

test("redaction keeps the idea and removes the data", () => {
  const r = redact("Idea: SMS alerts. Reach me at +91 98765 43210, 17.385044, 78.486671");
  assert.match(r.text, /Idea: SMS alerts/);
  assert.deepEqual(r.removed.sort(), ["gps", "phone"]);
});

test("spawn-node adds a city and writes its AGENTS.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "family-"));
  const file = join(dir, "family.json");
  copyFileSync(FAMILY_FILE, file);
  execFileSync("node", [join(ROOT, "scripts", "spawn-node.mjs"), "--file", file, "--out", join(dir, "nodes"), "--country", "KE", "--city", "KE-mombasa", "--city-name", "Mombasa", "--languages", "sw,en"]);
  const fam = buildFamily({ file, brain: new RuleBrain() });
  assert.deepEqual(fam.bus.path("KE-mombasa", "KE-nairobi"), ["KE-mombasa", "KE", "KE-nairobi"]);
  const md = readFileSync(join(dir, "nodes", "KE", "KE-mombasa", "AGENTS.md"), "utf8");
  assert.match(md, /node: KE-mombasa/);
  assert.match(readFileSync(join(dir, "nodes", "KE", "KE-nairobi", "AGENTS.md"), "utf8"), /Sibling cities: Mombasa/);
});

test("Claude brain falls back to the rule brain when Claude is unavailable", async () => {
  const broken = { beta: { messages: { create: async () => { throw new Error("no credentials"); } } } };
  const out = await new ClaudeBrain({ client: broken }).assess(KAKINADA_IDEA);
  assert.match(out.brain, /^rule \(claude unavailable/);
  assert.ok(out.scores.womenImpact > 0);
});

test("Claude brain parses and clamps a JSON reply", async () => {
  const fake = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: '{"title":"Voice Java school","summary":"s","category":"livelihood","scores":{"womenImpact":1.7,"feasibility":0.5,"clarity":0.9},"enhancements":["a","b","c","d"]}' }] }) } } };
  const out = await new ClaudeBrain({ client: fake }).assess("x");
  assert.equal(out.brain, "claude");
  assert.equal(out.scores.womenImpact, 1);
  assert.equal(out.enhancements.length, 3);
});

test("node files exist for every place in family.json", () => {
  const fam = JSON.parse(readFileSync(FAMILY_FILE, "utf8"));
  for (const c of fam.countries) {
    assert.ok(existsSync(join(ROOT, "agents", "nodes", c.id, "AGENTS.md")), c.id);
    for (const city of c.cities) assert.ok(readdirSync(join(ROOT, "agents", "nodes", c.id)).includes(city.id), city.id);
  }
});
