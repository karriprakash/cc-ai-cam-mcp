// Local smoke test: calls the handler directly with MCP JSON-RPC requests.
import { POST } from "../api/mcp.js";

async function call(body: unknown) {
  const res = await POST(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.text() };
}

console.log(await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } }));
console.log(await call({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
console.log(await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { message: "hello" } } }));
