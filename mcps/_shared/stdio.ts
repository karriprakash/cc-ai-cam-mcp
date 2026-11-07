// Run any idea MCP locally over stdio, e.g. for Claude Code / Claude Desktop:
//   claude mcp add trustadda -- npx tsx /path/to/cc-ai-cam-mcp/mcps/_shared/stdio.ts trustadda
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MCPS } from "../index.js";

const slug = process.argv[2];
const mod = MCPS.find((m) => m.slug === slug);
if (!mod) {
  console.error(`Unknown MCP "${slug ?? ""}". Available: ${MCPS.map((m) => m.slug).join(", ")}`);
  process.exit(1);
}
await mod.createServer().connect(new StdioServerTransport());
