import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

/**
 * Stateless Streamable HTTP handlers for a Vercel function (or any runtime
 * with web-standard Request/Response): a fresh server + transport per request.
 */
export function makeHttpHandlers(createServer: () => McpServer) {
  async function handle(request: Request): Promise<Response> {
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  }
  return { GET: handle, POST: handle, DELETE: handle };
}
