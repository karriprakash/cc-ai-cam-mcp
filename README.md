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

Add new tools in `src/mcp-server.ts`.

## Idea MCPs

One MCP per project idea, each its own server under `mcps/<slug>/`, served at `/<slug>/mcp`:

| MCP | What it does | Endpoint |
| --- | ------------ | -------- |
| `trustadda` | Honesty self-checkout: list stores, search items, price a cart from live prices, place orders, UPI links, refills, feedback, partner inquiries. Env: `TRUSTADDA_API_URL` | `/trustadda/mcp` |
| `mypgspace` | PG & hostel management: 30-day notice check, rent status, occupancy by floor; rooms, tenants, complaints via the API. Env: `MYPGSPACE_API_URL`, `MYPGSPACE_TOKEN` | `/mypgspace/mcp` |
| `omnivideo` | Telugu + English video studio: platform specs, export/reframe plans with ffmpeg crop, YouTube chapters, SRT captions, Telugu hooks and memes | `/omnivideo/mcp` |
| `social-push` | One video, many platforms: rules, hashtag cleanup, post validation and a publish package for YouTube, Instagram, Facebook | `/social-push/mcp` |
<!-- new-mcp:row -->

```bash
claude mcp add --transport http omnivideo https://mcp.trustadda.com/omnivideo/mcp   # deployed
claude mcp add omnivideo -- npx tsx ./mcps/_shared/stdio.ts omnivideo               # local
```

### Make a new one from an idea

The `mcp-from-idea` skill (`.claude/skills/mcp-from-idea/SKILL.md`) walks Claude from a one-line idea to a tested MCP. The fast path:

```bash
npm run new-mcp -- my-idea "One line describing the idea"
npm run smoke:all -- my-idea
```

## Develop

```bash
npm install
npm run typecheck
npm run test:local
npm run smoke:all     # every idea MCP
```

Deployed on Vercel: `api/mcp.ts` is the serverless function, and `vercel.json` maps `/mcp` to it.
