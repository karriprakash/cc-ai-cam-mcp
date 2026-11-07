// market-check tool: compares an idea with what already exists, so a contributor gets
// credit for a new idea or for the enhancement she adds to an existing one.
// The seed catalog describes common product categories, not specific brands.
// For a live market check, the Claude brain can add web research on top of this.

const STOP = new Set("the a an and or for with that this from into onto about over under their them they she her his our your you are was were will can could should would have has had not but all any each per via who what when where which while app apps".split(" "));

export function tokens(text) {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export const SEED_CATALOG = [
  { id: "mkt-sos", text: "Women safety SOS button that shares live location with trusted contacts during emergency" },
  { id: "mkt-jobs", text: "Job portal listing work from home jobs for women returning after career break" },
  { id: "mkt-shg-ledger", text: "Digital ledger for women self help group savings and loans" },
  { id: "mkt-period", text: "Period tracker with cycle reminders and health tips" },
  { id: "mkt-tailor", text: "Online marketplace for home based women tailors to sell clothes" },
];

/**
 * Finds the closest existing ideas.
 * @param {string} text  the idea summary
 * @param {Array<{id:string,text:string,origin?:string}>} extra  ideas already in the family registry
 * @returns {{best: object|null, score: number, matches: object[]}}
 */
export function marketCheck(text, extra = []) {
  const pool = [...SEED_CATALOG.map((c) => ({ ...c, origin: "market" })), ...extra];
  const matches = pool.map((c) => ({ ...c, score: Number(similarity(text, c.text).toFixed(3)) })).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  return { best: matches[0] || null, score: matches[0]?.score || 0, matches: matches.slice(0, 3) };
}
