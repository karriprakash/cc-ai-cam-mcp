# cc-ai-cam-mcp

An open-source MCP (Model Context Protocol) server for making Claude Code easier.

**Endpoint:** `https://mcp.trustadda.com/mcp` (Streamable HTTP, stateless)

## Connect from Claude Code

```bash
claude mcp add --transport http cc-ai-cam https://mcp.trustadda.com/mcp
```

## Tools

| Tool   | What it does                          |
| ------ | ------------------------------------- |
| `ping` | Checks the server is reachable        |
| `echo` | Returns a message (connection test)   |

Add new tools in `src/server.ts`.

## Develop

```bash
npm install
npm run typecheck
npm run test:local
```

Deployed on Vercel: `api/mcp.ts` is the serverless function, and `vercel.json` maps `/mcp` to it.

## Open Family agents

[`open-family/`](open-family/) is a family of agents (global council, country, city and intake) that carries women's ideas, sent by call, voice note or WhatsApp, from every city to the world. It keeps contributors private, gives fair contribution points and connects similar ideas across countries. It also holds the cyber risk monitor and the test harness for this MCP server. See [`open-family/README.md`](open-family/README.md).

```bash
cd open-family && npm test && npm run demo
```
