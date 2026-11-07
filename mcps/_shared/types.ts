import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Every idea MCP in mcps/<slug>/tools.ts default-exports one of these. */
export interface McpModule {
  /** URL-safe id: served at /<slug>/mcp and run locally with `npm run mcp -- <slug>`. */
  slug: string;
  title: string;
  /** One line: the idea this MCP serves and who uses it. */
  description: string;
  /** Environment variables the tools read (never put secrets in tool arguments). */
  env?: Record<string, string>;
  createServer(): McpServer;
  /** Offline-safe sample calls. scripts/smoke-all.ts runs every one of them. */
  examples: Array<{ tool: string; args: Record<string, unknown> }>;
}
