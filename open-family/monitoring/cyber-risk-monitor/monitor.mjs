#!/usr/bin/env node
// Cyber risk monitor for a women-centric platform.
// Usage: node monitor.mjs [config.json] [--out out]
// Runs real checks (endpoints, TLS, security headers, MCP servers, secret/PII/media scan)
// and maps them onto a risk register. Writes JSON row files a dashboard can read.
// Nothing is simulated: a check that cannot reach its target is reported as "unknown".

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(here, "out");
const cfgPath = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") || join(here, "config.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const ranAt = new Date().toISOString();
const findings = [];
const checks = [];

const SEV = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
function addFinding(f) { findings.push({ ranAt, ...f }); }
function addCheck(c) { checks.push({ ranAt, ...c }); }

// ---------- Network helpers ----------
function openSocket(host, port) {
  return new Promise((resolve, reject) => {
    if (!proxy) {
      const s = tls.connect({ host, port, servername: host, timeout: 15000 }, () => resolve(s));
      s.on("error", reject);
      return;
    }
    const p = new URL(proxy);
    const r = http.request({ host: p.hostname, port: p.port, method: "CONNECT", path: `${host}:${port}`, timeout: 15000 });
    r.on("connect", (res, raw) => {
      if (res.statusCode !== 200) { raw.destroy(); return reject(Object.assign(new Error(`Blocked by network policy (proxy answered ${res.statusCode})`), { blocked: true })); }
      const s = tls.connect({ socket: raw, servername: host }, () => resolve(s));
      s.on("error", reject);
    });
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("Connection timed out")));
    r.end();
  });
}

async function probe(urlStr) {
  const u = new URL(urlStr);
  const port = Number(u.port) || 443;
  const sock = await openSocket(u.hostname, port);
  const cert = sock.getPeerCertificate();
  const authorized = sock.authorized;
  const res = await new Promise((resolve, reject) => {
    const req = https.request({ host: u.hostname, port, path: u.pathname + u.search, method: "GET", createConnection: () => sock, timeout: 15000 }, (r) => { r.resume(); r.on("end", () => resolve(r)); });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.end();
  });
  return { status: res.statusCode, headers: res.headers, cert, authorized };
}

// ---------- 1. Endpoints: transport + headers ----------
const HEADER_RULES = [
  { h: "strict-transport-security", sev: "high", title: "HSTS header missing", fix: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains" },
  { h: "content-security-policy", sev: "medium", title: "Content-Security-Policy missing", fix: "Add a CSP that limits scripts to your own origin" },
  { h: "x-content-type-options", sev: "low", title: "X-Content-Type-Options missing", fix: "Send X-Content-Type-Options: nosniff" },
  { h: "referrer-policy", sev: "low", title: "Referrer-Policy missing", fix: "Send Referrer-Policy: strict-origin-when-cross-origin" },
];

for (const ep of cfg.endpoints || []) {
  const t0 = performance.now();
  if (!ep.url.startsWith("https://")) {
    addFinding({ id: `${ep.id}-http`, category: "transport", severity: "critical", asset: ep.name, title: "Endpoint uses plain HTTP", detail: ep.url, fix: "Serve only over HTTPS" });
  }
  try {
    const r = await probe(ep.url);
    const days = r.cert?.valid_to ? Math.floor((new Date(r.cert.valid_to) - Date.now()) / 86400000) : null;
    addCheck({ id: `${ep.id}-reach`, area: "Endpoints", asset: ep.name, check: "Reachable over HTTPS", result: "pass", value: `HTTP ${r.status}`, ms: Math.round(performance.now() - t0) });
    addCheck({ id: `${ep.id}-tls`, area: "Endpoints", asset: ep.name, check: "TLS certificate valid", result: !r.authorized ? "fail" : days < cfg.tlsWarnDays ? "warn" : "pass", value: days == null ? "unknown" : `${days} days left`, ms: 0 });
    if (!r.authorized) addFinding({ id: `${ep.id}-cert`, category: "transport", severity: "critical", asset: ep.name, title: "Certificate not trusted", detail: "TLS verification failed", fix: "Install a certificate from a trusted CA" });
    else if (days < cfg.tlsWarnDays) addFinding({ id: `${ep.id}-expiry`, category: "transport", severity: "high", asset: ep.name, title: `Certificate expires in ${days} days`, detail: r.cert.valid_to, fix: "Renew the certificate; automate with ACME" });
    for (const rule of HEADER_RULES) {
      const ok = Boolean(r.headers[rule.h]);
      addCheck({ id: `${ep.id}-${rule.h}`, area: "Headers", asset: ep.name, check: rule.h, result: ok ? "pass" : "fail", value: ok ? String(r.headers[rule.h]).slice(0, 80) : "missing", ms: 0 });
      if (!ok) addFinding({ id: `${ep.id}-${rule.h}`, category: rule.h === "strict-transport-security" ? "transport" : "headers", severity: rule.sev, asset: ep.name, title: rule.title, detail: ep.url, fix: rule.fix });
    }
    const frame = r.headers["x-frame-options"] || /frame-ancestors/i.test(r.headers["content-security-policy"] || "");
    addCheck({ id: `${ep.id}-frame`, area: "Headers", asset: ep.name, check: "frame protection", result: frame ? "pass" : "fail", value: frame ? "present" : "missing", ms: 0 });
    if (!frame) addFinding({ id: `${ep.id}-frame`, category: "headers", severity: "medium", asset: ep.name, title: "No clickjacking protection", detail: ep.url, fix: "Send X-Frame-Options: DENY or CSP frame-ancestors 'none'" });
  } catch (e) {
    addCheck({ id: `${ep.id}-reach`, area: "Endpoints", asset: ep.name, check: "Reachable over HTTPS", result: e.blocked ? "unknown" : "fail", value: e.message, ms: Math.round(performance.now() - t0) });
    addFinding({ id: `${ep.id}-reach`, category: "transport", severity: e.blocked ? "info" : "high", asset: ep.name, title: e.blocked ? "Monitor cannot reach endpoint" : "Endpoint unreachable", detail: e.message, fix: e.blocked ? "Allow this host in the monitor's network policy, then rerun" : "Check DNS, server and firewall" });
  }
}

// ---------- 2. MCP servers (reuses the MCP test harness) ----------
const harness = join(here, "..", "mcp-testing", "test-mcp.mjs");
for (const s of cfg.mcpServers || []) {
  const tmp = join(outDir, `.mcp-${s.name}.json`);
  mkdirSync(outDir, { recursive: true });
  try { execFileSync("node", [harness, s.name, s.url, "--out", tmp], { cwd: process.cwd(), stdio: "ignore", timeout: 120000 }); } catch { /* harness exits 1 on failure; report still written */ }
  try {
    const rep = JSON.parse(readFileSync(tmp, "utf8"));
    for (const r of rep.results) addCheck({ id: `mcp-${s.name}-${r.id}`, area: "MCP", asset: s.name, check: r.title, result: r.status === "skipped" ? "unknown" : r.status, value: r.detail, ms: r.ms });
    const blocked = rep.results.find((r) => r.id === "tunnel" && r.status === "fail");
    const failed = rep.results.filter((r) => r.status === "fail");
    if (blocked) addFinding({ id: `mcp-${s.name}`, category: "mcp", severity: "info", asset: s.name, title: "Monitor cannot reach MCP server", detail: blocked.detail, fix: "Allow the host in the network policy, then rerun" });
    else if (failed.length) addFinding({ id: `mcp-${s.name}`, category: "mcp", severity: "high", asset: s.name, title: "MCP server checks failing", detail: failed.map((f) => f.title).join("; "), fix: "See MCP checks for details" });
  } catch (e) {
    addCheck({ id: `mcp-${s.name}`, area: "MCP", asset: s.name, check: "Run MCP test harness", result: "fail", value: e.message, ms: 0 });
  }
}

// ---------- 3. Code and data exposure scan ----------
const verhoeffD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const verhoeffP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const verhoeffOk = (n) => { let c = 0; [...n].reverse().forEach((d, i) => { c = verhoeffD[c][verhoeffP[i % 8][+d]]; }); return c === 0; };

const PATTERNS = [
  { kind: "secrets", sev: "critical", name: "Private key", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "secrets", sev: "critical", name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "secrets", sev: "critical", name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { kind: "secrets", sev: "critical", name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "secrets", sev: "high", name: "Hard-coded credential", re: /\b(api[_-]?key|secret|password|token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/gi },
  { kind: "pii", sev: "high", name: "Indian mobile number", re: /(?<![\d.])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g },
  { kind: "pii", sev: "critical", name: "Aadhaar number", re: /(?<!\d)[2-9]\d{3}\s?\d{4}\s?\d{4}(?!\d)/g, validate: (m) => verhoeffOk(m.replace(/\s/g, "")) },
  { kind: "pii", sev: "medium", name: "Email address", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, validate: (m) => !/@(example\.(com|org)|anthropic\.com)$/i.test(m) },
  { kind: "pii", sev: "high", name: "GPS coordinates", re: /\b-?\d{1,2}\.\d{5,},\s*-?\d{1,3}\.\d{5,}\b/g },
];
const MEDIA = new Set([".mp3", ".m4a", ".ogg", ".opus", ".wav", ".amr", ".aac", ".mp4", ".3gp", ".jpg", ".jpeg", ".heic", ".png"]);
const TEXT = new Set([".js", ".mjs", ".ts", ".json", ".java", ".py", ".env", ".yml", ".yaml", ".txt", ".md", ".csv", ".log", ".html", ".properties", ".xml", ".sql", ""]);
const mask = (s) => (s.length <= 6 ? "***" : s.slice(0, 3) + "*".repeat(Math.max(3, s.length - 6)) + s.slice(-3));

let filesScanned = 0;
const counts = { secrets: 0, pii: 0, media: 0 };
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if ((cfg.scanIgnore || []).includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    const ext = extname(name).toLowerCase();
    if (MEDIA.has(ext)) {
      counts.media++;
      const buf = readFileSync(p);
      const gps = (ext === ".jpg" || ext === ".jpeg") && buf.includes(Buffer.from([0x88, 0x25]));
      addFinding({ id: `media-${p}`, category: "media", severity: gps ? "critical" : "high", asset: p, title: gps ? "Photo with GPS location in repository" : "Raw media file in repository", detail: `${(st.size / 1024).toFixed(0)} KB`, fix: "Remove from the repository; store in encrypted storage with metadata stripped" });
      continue;
    }
    if (!TEXT.has(ext) || st.size > 2_000_000) continue;
    filesScanned++;
    const text = readFileSync(p, "utf8");
    if (p === fileURLToPath(import.meta.url) || p.endsWith("config.json") || p.endsWith("selftest.mjs")) continue; // the monitor's own patterns
    for (const pat of PATTERNS) {
      for (const m of text.matchAll(pat.re)) {
        if (pat.validate && !pat.validate(m[0])) continue;
        counts[pat.kind]++;
        const line = text.slice(0, m.index).split("\n").length;
        addFinding({ id: `${pat.kind}-${p}-${line}`, category: pat.kind, severity: pat.sev, asset: `${p}:${line}`, title: `${pat.name} found`, detail: mask(m[0]), fix: pat.kind === "secrets" ? "Revoke the key, remove it, load it from a secret manager" : "Remove or tokenise the personal data; never log it" });
      }
    }
  }
}
for (const sp of cfg.scanPaths || []) { try { walk(resolve(dirname(cfgPath), sp)); } catch (e) { addCheck({ id: `scan-${sp}`, area: "Data exposure", asset: sp, check: "Scan folder", result: "fail", value: e.message, ms: 0 }); } }
addCheck({ id: "scan-secrets", area: "Data exposure", asset: "Code folders", check: "No secrets in code", result: counts.secrets ? "fail" : "pass", value: `${counts.secrets} found in ${filesScanned} files`, ms: 0 });
addCheck({ id: "scan-pii", area: "Data exposure", asset: "Code folders", check: "No personal data in code", result: counts.pii ? "fail" : "pass", value: `${counts.pii} found in ${filesScanned} files`, ms: 0 });
addCheck({ id: "scan-media", area: "Data exposure", asset: "Code folders", check: "No raw recordings or photos", result: counts.media ? "fail" : "pass", value: `${counts.media} media files`, ms: 0 });

// ---------- 4. Risk register ----------
const byCat = (cat) => findings.filter((f) => f.category === cat);
const checkFor = (cat) => checks.filter((c) => (cat === "mcp" ? c.area === "MCP" : cat === "headers" ? c.area === "Headers" : cat === "transport" ? c.area === "Endpoints" : c.id === `scan-${cat}`));
const risks = cfg.riskRegister.map((r) => {
  const inherent = r.likelihood * r.impact;
  let control = "not assessed", evidence = "Manual control: record the review in config.json";
  if (r.check) {
    const fs = byCat(r.check).filter((f) => f.severity !== "info");
    const cs = checkFor(r.check);
    const unknown = cs.length === 0 || cs.every((c) => c.result === "unknown") || byCat(r.check).some((f) => f.severity === "info");
    control = fs.length ? "failing" : unknown ? "unknown" : "passing";
    evidence = fs.length ? `${fs.length} open finding(s)` : unknown ? "Monitor could not reach the target" : `${cs.length} check(s) passed`;
  }
  if (r.status) { control = r.status; evidence = r.evidence || "Manual review"; }
  const residual = control === "passing" ? Math.ceil(inherent / 3) : inherent;
  return { id: r.id, threat: r.threat, asset: r.asset, likelihood: r.likelihood, impact: r.impact, inherent, residual, control, controlDescription: r.control, evidence, automated: Boolean(r.check), ranAt };
});

findings.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "checks.json"), JSON.stringify(checks, null, 2));
writeFileSync(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));
writeFileSync(join(outDir, "risks.json"), JSON.stringify(risks, null, 2));

const tally = (arr, k) => arr.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
console.log("Checks:", tally(checks, "result"));
console.log("Findings:", tally(findings, "severity"));
console.log("Risk controls:", tally(risks, "control"));
console.log(`Wrote ${checks.length} checks, ${findings.length} findings, ${risks.length} risks → ${outDir}`);
