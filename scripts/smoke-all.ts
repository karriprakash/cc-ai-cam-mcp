// Smoke-tests every idea MCP over the same HTTP handler Vercel runs:
// initialize, tools/list, then every offline example. Exits 1 on any failure.
// Usage: npm run smoke:all            (all)    npm run smoke:all -- omnivideo   (one)
import { makeHttpHandlers } from "../mcps/_shared/http.js";
import { MCPS } from "../mcps/index.js";

const only = process.argv[2];
let failures = 0;

for (const mod of MCPS.filter((m) => !only || m.slug === only)) {
  const { POST } = makeHttpHandlers(mod.createServer);
  let id = 0;
  const rpc = async (method: string, params?: unknown) => {
    const res = await POST(new Request(`http://localhost/${mod.slug}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }));
    return (await res.json()) as { result?: any; error?: any };
  };

  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
  const tools = (await rpc("tools/list")).result?.tools ?? [];
  const names: string[] = tools.map((t: { name: string }) => t.name);
  console.log(`\n■ ${mod.slug} (${init.result?.serverInfo?.name}) — ${names.length} tools: ${names.join(", ")}`);
  if (!init.result || names.length === 0) { failures++; console.log("  ✗ initialize/tools/list failed"); continue; }

  for (const ex of mod.examples) {
    if (!names.includes(ex.tool)) { failures++; console.log(`  ✗ example uses unknown tool ${ex.tool}`); continue; }
    const r = await rpc("tools/call", { name: ex.tool, arguments: ex.args });
    const text: string = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
    const bad = !r.result || r.result.isError;
    if (bad) failures++;
    console.log(`  ${bad ? "✗" : "✓"} ${ex.tool}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll MCPs OK");
process.exit(failures ? 1 : 0);
