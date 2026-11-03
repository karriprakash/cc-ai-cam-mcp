---
name: mcp-from-idea
description: Turn a one-line idea (typed, voice note, WhatsApp text, or an existing repo) into a working, tested MCP server in minutes. Use when someone says "make an MCP for my idea", "create MCP tools for <project>", "expose <app> to Claude", or wants Claude to work with their product's data or rules.
---

# MCP from an idea

Goal: idea → idea card → 3-7 tools → scaffold → implement → smoke test → connect. Aim for under 30 minutes. Each step's output is short; don't polish early.

This repo already has everything the fast path needs:
- `npm run new-mcp -- <slug> "<one-line idea>"` scaffolds `mcps/<slug>/tools.ts`, `api/<slug>.ts` (Vercel endpoint at `/<slug>/mcp`), registry entry, README row.
- `mcps/_shared/`: `ok`/`fail` results, `callApi` (REST client with readable errors), `makeHttpHandlers` (stateless HTTP), `stdio.ts` (local runner), `platforms.ts` (social/video limits).
- `npm run smoke:all -- <slug>` runs initialize, tools/list and every example over the real HTTP handler.

Outside this repo, copy `mcps/_shared/` and `scripts/new-mcp.ts`, or follow the same steps by hand with `@modelcontextprotocol/sdk` + `zod`.

## 1. Idea card (2 minutes)

Write five lines before any code. Ask the user only for what you can't find in their repo or message:

```
Idea:     <one sentence, in the user's words>
Users:    <who talks to Claude with this MCP: owner, tenant, creator, resident...>
Jobs:     <3-5 things they'd ask Claude to do>
Data:     <where the truth lives: REST API + env var, a file, or pure rules>
Risky:    <writes, money, personal data (names, phones), anything irreversible>
```

If the idea comes from a repo, read its README, routes/controllers, models and config constants first: real endpoints, field names and business rules beat invented ones.

## 2. Pick tools (5 minutes)

Rule of thumb: **tools fetch, act and check; the model writes.** Don't build a "generate caption" tool that calls another LLM. Build `platform_rules` + `validate_post`, and let Claude write the caption between them.

Good tool kinds, in order of value:
1. **Read data**: `list_*`, `search_*`, `get_*` (wrap the app's existing read API).
2. **Exact checks and math** the model gets wrong: limits, dates, money, crop sizes, timestamps (`notice_period_check`, `reframe`, `validate_chapters`).
3. **Actions**: `place_order`, `raise_complaint`. Recompute anything important server-side (prices, totals) instead of trusting arguments, and say in the description "only after the user confirms".
4. **Packaging**: turn the model's draft into the exact format the next system needs (`build_publish_package`, `srt_from_segments`, `upi_payment_link`).

Keep it to 3-7 tools. Names are `verb_noun`. Descriptions say when to call it and what it returns, in one or two sentences.

## 3. Scaffold (1 minute)

```bash
npm run new-mcp -- <slug> "<one-line idea>"
```

## 4. Implement (10-15 minutes)

In `mcps/<slug>/tools.ts`:
- One `server.registerTool(name, { title, description, inputSchema }, handler)` per tool. `inputSchema` is a plain object of zod fields; use `.describe()` on anything non-obvious and `z.enum` for fixed choices.
- Return `ok(data)` or `fail("what went wrong and how to fix it")`. Never throw for user errors.
- API base URLs and tokens come from `process.env` and are listed in the module's `env` map. **Never accept passwords, tokens or keys as tool arguments.**
- Put pure business rules in exported functions (`export function rentStatus(...)`) so they're testable and reusable.
- Constants that change (platform limits, notice days) live at the top with a comment saying where they came from.

Fill `examples` with 1-5 offline-safe calls (pure tools only; network tools are tested against a running app instead).

## 5. Test (3 minutes)

```bash
npm run typecheck
npm run smoke:all -- <slug>
```

For tools that call an API, start the app locally and run the tool through the HTTP handler with the env var pointing at it (see the PR that added `trustadda` for a pattern). Check one success, one validation failure and one unreachable-server error.

## 6. Connect

- Local (stdio): `claude mcp add <slug> -- npx tsx <repo>/mcps/_shared/stdio.ts <slug>`, with env vars set via `-e KEY=value`.
- Deployed (Vercel): push; the endpoint is `https://<domain>/<slug>/mcp`. `claude mcp add --transport http <slug> https://<domain>/<slug>/mcp`.

## Safety checklist (don't skip)

- Personal data: return only what the job needs. Respect anonymity flags. Phone numbers go to the app, not into logs.
- Money: prices and totals come from the server. Payment links show the payee clearly.
- Writes: name them clearly and say "after confirmation" in the description.
- Auth: if the app's write API is unauthenticated, say so in the PR and use only the public resident/customer endpoints.
- A public HTTP endpoint is open to anyone: only deploy tools that are safe without a login, or keep token-based tools stdio-only.

## Done means

- typecheck passes, smoke passes, each network tool tried once against a real server
- README row with what it does and its env vars
- A draft PR listing the tools and anything the user must decide
