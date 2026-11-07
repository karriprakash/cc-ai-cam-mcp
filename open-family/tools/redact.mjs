// privacy-shield tool: finds and removes personal data before anything leaves a city.
// Women contributors' phone numbers, emails, ID numbers and locations must never travel up the family tree.

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export const verhoeffValid = (digits) => { let c = 0; [...digits].reverse().forEach((d, i) => { c = D[c][P[i % 8][+d]]; }); return c === 0; };

export const PII_PATTERNS = [
  { kind: "aadhaar", label: "[ID]", re: /(?<!\d)[2-9]\d{3}\s?\d{4}\s?\d{4}(?!\d)/g, valid: (m) => verhoeffValid(m.replace(/\s/g, "")) },
  { kind: "phone", label: "[PHONE]", re: /(?<![\d.])(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}\d(?![\d.])/g },
  { kind: "email", label: "[EMAIL]", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "gps", label: "[LOCATION]", re: /-?\d{1,2}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g },
];

/** Returns every personal-data match in a string. */
export function findPII(text) {
  const hits = [];
  for (const p of PII_PATTERNS) {
    for (const m of String(text).matchAll(p.re)) {
      if (p.valid && !p.valid(m[0])) continue;
      hits.push({ kind: p.kind, value: m[0], index: m.index });
    }
  }
  return hits;
}

/** Replaces personal data with labels. Returns { text, removed } where removed lists kinds only (never values). */
export function redact(text) {
  let out = String(text);
  const removed = [];
  for (const p of PII_PATTERNS) {
    out = out.replace(p.re, (m) => {
      if (p.valid && !p.valid(m)) return m;
      removed.push(p.kind);
      return p.label;
    });
  }
  return { text: out, removed };
}

/** Deep scan of any message payload. */
export function payloadHasPII(payload) {
  return findPII(JSON.stringify(payload ?? "")).length > 0;
}
