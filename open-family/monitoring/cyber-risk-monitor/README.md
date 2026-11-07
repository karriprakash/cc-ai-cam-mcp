# Cyber risk monitor

Monitors a women-centric platform (ideas sent by call, voice note or WhatsApp) for the cyber risks that hurt contributors most: doxxing, location leaks in recordings, leaked keys, weak transport, missing security headers, and a broken MCP server.

## Run

```bash
node monitor.mjs            # uses config.json, writes out/*.json
node selftest.mjs           # plants fake leaks and checks the scanner catches them
node ../mcp-testing/test-mcp.mjs cc-ai-cam https://mcp.trustadda.com/mcp   # MCP test harness only
```

Node 18+ and no dependencies are needed. The MCP harness must run from the folder where you ran `claude mcp add`, because a local-scope server is saved per project folder.

## What it checks

| Area | Checks |
|---|---|
| Endpoints | Reachable over HTTPS, TLS certificate trusted and not expiring soon |
| Headers | HSTS, CSP, X-Content-Type-Options, Referrer-Policy, clickjacking protection |
| MCP | CLI, registration, HTTPS, DNS, network, `initialize`, `tools/list`, Claude Code status |
| Data exposure | Private keys, AWS/GitHub/Anthropic keys, hard-coded passwords, Indian mobile numbers, Aadhaar numbers (Verhoeff checksum), emails, GPS coordinates, raw voice notes and geotagged photos |

Leaked values are masked in every report.

## Output files (`out/`)

- `checks.json`: one row per automated check
- `findings.json`: problems sorted by severity
- `risks.json`: risk register with control status (`passing`, `failing`, `unknown`, `not assessed`)
- `selftest.json`: self-test results

These are the dashboard's data sources.

## Adapting it

Edit `config.json`: add your endpoints, MCP servers and code folders, and adjust each risk's likelihood and impact. To record a manual review on a risk without an automated check, add `"status": "passing"` and `"evidence": "Reviewed 2026-11-10 by …"` to it.
