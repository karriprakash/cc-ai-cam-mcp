// The four levels of the family: global council, country, city and intake.
// Each level reads its AGENTS.md: the frontmatter decides which skills it knows and which tools it may use.
import { createHash, randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontmatter } from "./frontmatter.mjs";
import { redact } from "../tools/redact.mjs";
import { marketCheck, similarity } from "../tools/market.mjs";
import { allocateShares } from "../tools/shares.mjs";
import { Ledger } from "../tools/ledger.mjs";
import { RuleBrain } from "./brain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = { redact, marketCheck, allocateShares };

export class Agent {
  constructor({ id, name, level, parentId = null, profile = {} }) {
    const spec = readFrontmatter(join(ROOT, "agents", level, "AGENTS.md"));
    this.id = id;
    this.name = name;
    this.level = level;
    this.parentId = parentId;
    this.profile = profile;
    this.skills = spec.data.skills || [];
    this.allowedTools = new Set(spec.data.tools || []);
    this.inbox = [];
    this.seen = [];
  }
  /** Calls a tool, only if this level's AGENTS.md lists it. */
  tool(name, ...args) {
    if (!this.allowedTools.has(name)) throw new Error(`${this.level} agent ${this.id} is not allowed to use tool "${name}"`);
    return TOOLS[name](...args);
  }
  send(to, type, payload) { return this.bus.send({ from: this.id, to, type, payload }); }
  toParent(type, payload) { return this.send(this.parentId, type, payload); }
  async toChildren(type, payload) { return Promise.all(this.bus.childrenOf(this.id).map((c) => this.send(c, type, payload))); }
  observe(msg) { this.seen.push({ type: msg.type, from: msg.from, to: msg.to }); }
  async receive(msg) {
    this.inbox.push(msg);
    const handler = this[`on_${msg.type.replace(/\./g, "_")}`];
    if (handler) return handler.call(this, msg);
    if (msg.type === "family.announce") return this.toChildren("family.announce", msg.payload);
    return null;
  }
}

/** Talks to contributors on calls, voice notes and WhatsApp. Keeps contact details in a local vault. */
export class IntakeAgent extends Agent {
  constructor(opts) {
    super({ ...opts, level: "intake" });
    this.salt = opts.salt || process.env.PSEUDONYM_SALT || randomBytes(16).toString("hex");
    this.vault = new Map(); // pseudonym -> contact; never leaves this agent
    this.outbox = [];       // messages to contributors, delivered by the channel integration
  }
  pseudonym(contact) { return "c_" + createHash("sha256").update(this.salt + contact).digest("hex").slice(0, 12); }

  /** Entry point for a contribution. `text` is the transcript of a call or voice note, or a WhatsApp message. */
  async accept({ channel, contact, text, language = "en" }) {
    const who = this.pseudonym(contact);
    this.vault.set(who, { channel, contact });
    const clean = this.tool("redact", text);
    this.outbox.push({ to: who, channel, text: "Thank you. Your idea reached the family. We will tell you your points here." });
    return this.toParent("idea.submitted", { contributor: who, channel, language, text: clean.text, redactedKinds: clean.removed });
  }
  async on_share_granted(msg) {
    const p = msg.payload;
    this.outbox.push({ to: p.contributor, channel: this.vault.get(p.contributor)?.channel, text: `Your idea "${p.title}" earned ${p.points} contribution points (${p.mode}).` });
  }
  async on_collab_introduce(msg) {
    const p = msg.payload;
    if (this.vault.has(p.contributor)) this.outbox.push({ to: p.contributor, channel: this.vault.get(p.contributor).channel, text: `A contributor in ${p.partnerPlace} had a similar idea. Would you like to build it together?` });
  }
}

/** Understands ideas, finds mentors locally, helps sibling cities. */
export class CityAgent extends Agent {
  constructor(opts) {
    super({ ...opts, level: "city" });
    this.brain = opts.brain || new RuleBrain();
    this.ideas = new Map();
    this.mentors = opts.profile?.mentors || [];
  }
  async on_idea_submitted(msg) {
    const { contributor, text, channel } = msg.payload;
    const assessment = await this.brain.assess(text);
    const ideaId = `${this.id}:${this.ideas.size + 1}`;
    this.ideas.set(ideaId, { ideaId, contributor, intake: msg.from, channel, ...assessment });
    return this.toParent("idea.review", { ideaId, contributor, city: this.id, cityName: this.name, ...assessment });
  }
  async on_share_granted(msg) {
    const idea = this.ideas.get(msg.payload.ideaId);
    if (idea) return this.send(idea.intake, "share.granted", msg.payload);
  }
  async on_collab_introduce(msg) {
    const idea = this.ideas.get(msg.payload.ideaId);
    if (idea) return this.send(idea.intake, "collab.introduce", { ...msg.payload, contributor: idea.contributor });
  }
  /** A sibling city asks for mentors in a field. */
  async on_help_request(msg) {
    const field = msg.payload.field;
    const offer = this.mentors.filter((m) => m.field === field).map((m) => ({ alias: m.alias, field: m.field, languages: m.languages }));
    return this.send(msg.from, "help.offer", { field, offer, fromCity: this.name });
  }
  async on_help_offer(msg) { this.offers = [...(this.offers || []), msg.payload]; }
}

/** Groups its cities, relays ideas, shares news across its cities. */
export class CountryAgent extends Agent {
  constructor(opts) { super({ ...opts, level: "country" }); this.reviewed = 0; }
  async on_idea_review(msg) { this.reviewed++; return this.toParent("idea.review", { ...msg.payload, country: this.id, countryName: this.name }); }
  async on_share_granted(msg) { return this.send(msg.payload.city, "share.granted", msg.payload); }
  async on_collab_introduce(msg) { return this.send(msg.payload.city, "collab.introduce", msg.payload); }
}

/** The parent of the whole family: checks the market, allocates points, links similar ideas worldwide. */
export class GlobalAgent extends Agent {
  constructor(opts) {
    super({ ...opts, level: "global" });
    this.ledger = opts.ledger || new Ledger(opts.ledgerFile || null);
    this.registry = []; // every reviewed idea in the family
    this.alerts = [];
    this.jointThreshold = opts.jointThreshold ?? 0.35;
  }
  async on_idea_review(msg) {
    const idea = msg.payload;
    const text = `${idea.title}. ${idea.summary}`;
    // Points compare the idea with the outside market only. Comparing with earlier family ideas would
    // give a later contributor fewer points just for arriving second; similar family ideas become a
    // collaboration introduction instead.
    const market = this.tool("marketCheck", text);
    const share = this.tool("allocateShares", idea.scores, market.score);
    const entry = this.ledger.append({ contributor: idea.contributor, ideaId: idea.ideaId, city: idea.city, points: share.points, mode: share.mode, matchedWith: market.best?.id || null });
    const reg = { ...idea, text };
    this.registry.push(reg);

    await this.send(idea.country, "share.granted", { ideaId: idea.ideaId, city: idea.city, contributor: idea.contributor, title: idea.title, points: share.points, mode: share.mode, breakdown: share.breakdown, ledgerSeq: entry.seq });

    // Joint family: a similar idea from a different city becomes an introduction between both cities.
    for (const r of this.registry) {
      if (r.city === idea.city || r === reg) continue;
      if (similarity(text, r.text) >= this.jointThreshold) {
        await this.send(idea.country, "collab.introduce", { ideaId: idea.ideaId, city: idea.city, partnerPlace: `${r.cityName}, ${r.countryName}`, topic: idea.title });
        await this.send(r.country, "collab.introduce", { ideaId: r.ideaId, city: r.city, partnerPlace: `${idea.cityName}, ${idea.countryName}`, topic: r.title });
      }
    }
    return share;
  }
  async on_safety_alert(msg) { this.alerts.push(msg.payload); }
  announce(text) { return this.toChildren("family.announce", { text }); }
}
