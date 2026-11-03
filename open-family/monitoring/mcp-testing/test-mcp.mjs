#!/usr/bin/env node
// MCP server connection test harness.
// Usage: node test-mcp.mjs [name] [url] [--out results.json]
// Runs real checks against a remote HTTP MCP server and writes a JSON report.
// No results are simulated: a check that cannot run is reported as "skipped" with the reason.

import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : "results.json";
const positional = args.filter((a, i) => a !== "--out" && i !== outIdx + 1);
const NAME = positional[0] || "cc-ai-cam";
const URL_STR = positional[1] || "https://mcp.trustadda.com/mcp";
const TIMEOUT = 15000;

const results = [];
let sessionId = null;
let tunnelOk = null;
let initOk = false;

async function check(id, title, category, fn, { dependsOn } = {}) {
  if (dependsOn && !dependsOn()) {
    results.push({ id, title, category, status: "skipped", ms: 0, detail: "Skipped: an earlier check this depends on did not pass." });
    return;
  }
  const t0 = performance.now();
  try {
    const r = await fn();
    results.push({ id, title, category, status: r.status || "pass", ms: Math.round(performance.now() - t0), detail: r.detail, evidence: r.evidence });
  } catch (e) {
    results.push({ id, title, category, status: "fail", ms: Math.round(performance.now() - t0), detail: String(e.message || e) });
  }
}

function run(cmd, argv) {
  return execFileSync(cmd, argv, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const url = new URL(URL_STR);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || null;

// Send one JSON-RPC message to the MCP endpoint (through the proxy if set).
function mcpPost(body) {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const send = (socket) => {
      const req = https.request(
        { host: url.hostname, port: url.port || 443, path: url.pathname + url.search, method: "POST", headers, createConnection: socket ? () => tls.connect({ socket, servername: url.hostname }) : undefined, timeout: TIMEOUT },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }
      );
      req.on("timeout", () => req.destroy(new Error("Request timed out")));
      req.on("error", reject);
      req.end(JSON.stringify(body));
    };
    if (!proxy) return send(null);
    const p = new URL(proxy);
    const creq = http.request({ host: p.hostname, port: p.port, method: "CONNECT", path: `${url.hostname}:${url.port || 443}`, timeout: TIMEOUT });
    creq.on("connect", (res, socket) => (res.statusCode === 200 ? send(socket) : reject(new Error(`Proxy CONNECT returned ${res.statusCode}`))));
    creq.on("error", reject);
    creq.end();
  });
}

function parseRpc(resp) {
  const ct = String(resp.headers["content-type"] || "");
  if (ct.includes("text/event-stream")) {
    const line = resp.body.split("\n").find((l) => l.startsWith("data:"));
    return line ? JSON.parse(line.slice(5)) : null;
  }
  return resp.body ? JSON.parse(resp.body) : null;
}

await check("cli", "Claude Code CLI is installed", "Setup", async () => {
  const v = run("claude", ["--version"]);
  return { detail: `Found ${v}`, evidence: v };
});

let registered = false;
await check("registered", `Server "${NAME}" is registered`, "Setup", async () => {
  const out = run("claude", ["mcp", "get", NAME]);
  registered = out.includes(URL_STR);
  if (!registered) throw new Error(`Registered, but URL does not match ${URL_STR}`);
  const scope = (out.match(/Scope:\s*(.+)/) || [])[1];
  const type = (out.match(/Type:\s*(.+)/) || [])[1];
  return { detail: `Type ${type}, scope ${scope}`, evidence: out };
});

await check("url", "URL uses HTTPS", "Security", async () => {
  if (url.protocol !== "https:") throw new Error(`Protocol is ${url.protocol}; MCP over plain HTTP exposes data in transit.`);
  return { detail: `${url.protocol}//${url.host}${url.pathname}` };
});

await check("dns", "Host name resolves", "Network", async () => {
  try {
    const r = await lookup(url.hostname, { all: true });
    return { detail: r.map((a) => a.address).join(", ") };
  } catch (e) {
    if (proxy) return { status: "warn", detail: `Local DNS failed (${e.code}). Normal here: this sandbox resolves names at the egress proxy.` };
    throw e;
  }
});

await check("tunnel", "Network allows a connection to the host", "Network", async () => {
  if (!proxy) { tunnelOk = true; return { detail: "No proxy configured; direct connection." }; }
  const p = new URL(proxy);
  const code = await new Promise((resolve, reject) => {
    const r = http.request({ host: p.hostname, port: p.port, method: "CONNECT", path: `${url.hostname}:443`, timeout: TIMEOUT });
    r.on("connect", (res, s) => { s.destroy(); resolve(res.statusCode); });
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("CONNECT timed out")));
    r.end();
  });
  tunnelOk = code === 200;
  if (!tunnelOk) throw new Error(`Egress proxy answered ${code} to CONNECT ${url.hostname}:443. The environment's network policy blocks this host.`);
  return { detail: "Proxy opened a tunnel (200)." };
});

await check("initialize", "MCP initialize handshake", "Protocol", async () => {
  const resp = await mcpPost({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-test-harness", version: "1.0.0" } } });
  if (resp.status === 401) return { status: "warn", detail: "Server requires authentication (401). Run /mcp in Claude Code to sign in.", evidence: resp.headers["www-authenticate"] };
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0, 200)}`);
  sessionId = resp.headers["mcp-session-id"] || null;
  const msg = parseRpc(resp);
  if (msg?.error) throw new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`);
  initOk = true;
  const info = msg.result.serverInfo || {};
  return { detail: `${info.name || "server"} ${info.version || ""}, protocol ${msg.result.protocolVersion}`, evidence: msg.result };
}, { dependsOn: () => tunnelOk });

await check("tools", "List the server's tools", "Protocol", async () => {
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" });
  const resp = await mcpPost({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const msg = parseRpc(resp);
  if (msg?.error) throw new Error(msg.error.message);
  const tools = msg.result.tools || [];
  return { detail: `${tools.length} tools: ${tools.map((t) => t.name).join(", ") || "none"}`, evidence: tools.map((t) => ({ name: t.name, description: t.description })) };
}, { dependsOn: () => initOk });

await check("cli-health", "Claude Code reports the server connected", "Protocol", async () => {
  const out = run("claude", ["mcp", "get", NAME]);
  const status = (out.match(/Status:\s*(.+)/) || [])[1] || "unknown";
  const issue = (out.match(/Issue:\s*(.+)/) || [])[1];
  if (!/connected/i.test(status) || /fail/i.test(status)) throw new Error(`${status}${issue ? ` — ${issue}` : ""}`);
  return { detail: status };
}, { dependsOn: () => registered });

const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const report = {
  server: { name: NAME, url: URL_STR, transport: "http" },
  ranAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, viaProxy: Boolean(proxy) },
  summary,
  verdict: results.some((r) => r.status === "fail") ? "fail" : results.some((r) => r.status === "warn") ? "warn" : "pass",
  results,
};
writeFileSync(outFile, JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.status.toUpperCase().padEnd(7)} ${String(r.ms).padStart(5)}ms  ${r.title} — ${r.detail}`);
console.log(`\nVerdict: ${report.verdict.toUpperCase()}  ${JSON.stringify(summary)}  → ${outFile}`);
process.exitCode = report.verdict === "fail" ? 1 : 0;
