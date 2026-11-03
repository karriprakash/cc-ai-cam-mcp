// Append-only, hash-chained ledger of contribution points.
// Anyone can verify that no entry was edited or removed after the fact.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const hash = (s) => createHash("sha256").update(s).digest("hex");

export class Ledger {
  constructor(file = null) {
    this.file = file;
    this.entries = file && existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  }
  append(record) {
    const prev = this.entries.at(-1)?.hash || "GENESIS";
    const body = { seq: this.entries.length, at: new Date().toISOString(), prev, ...record };
    const entry = { ...body, hash: hash(JSON.stringify(body)) };
    this.entries.push(entry);
    if (this.file) appendFileSync(this.file, JSON.stringify(entry) + "\n");
    return entry;
  }
  /** Returns { ok, brokenAt } */
  verify() {
    let prev = "GENESIS";
    for (const [i, e] of this.entries.entries()) {
      const { hash: h, ...body } = e;
      if (e.prev !== prev || hash(JSON.stringify(body)) !== h) return { ok: false, brokenAt: i };
      prev = h;
    }
    return { ok: true, brokenAt: null };
  }
  totals() {
    const t = {};
    for (const e of this.entries) t[e.contributor] = (t[e.contributor] || 0) + e.points;
    return t;
  }
}
