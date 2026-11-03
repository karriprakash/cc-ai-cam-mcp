import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVER_NAME = "cc-ai-cam-mcp";
export const SERVER_VERSION = "0.1.0";

/** Builds a fresh MCP server with all tools registered. */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Check that the cc-ai-cam MCP server is reachable.",
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: "text", text: `pong from ${SERVER_NAME} v${SERVER_VERSION} at ${new Date().toISOString()}` },
      ],
    }),
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Return the given message unchanged. Useful for testing a client connection.",
      inputSchema: { message: z.string().describe("Text to echo back") },
    },
    async ({ message }) => ({ content: [{ type: "text", text: message }] }),
  );

  return server;
}
