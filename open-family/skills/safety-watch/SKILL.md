---
name: safety-watch
description: Watching the family for cyber risks that hurt women contributors, and responding to alerts.
---

# Safety watch

## Automatic

- The bus blocks any upward message carrying personal data and sends a `safety.alert` to the council. The alert carries no payload content.
- `monitoring/cyber-risk-monitor` checks endpoints, security headers, MCP servers and code folders for leaked keys and personal data. Run `npm run monitor`.

## Manual reviews

| Risk | What to check |
|---|---|
| SIM-swap account takeover | Offer app-based two-factor sign-in, not SMS only |
| Harassment through profiles | Profiles private by default; block and report work |
| Consent for recordings | She agreed before recording; recordings are deleted on schedule |
| Fake accounts posing as the family | One verified WhatsApp Business number, published openly |

## When an alert arrives

1. Find which agent stopped the message (`stoppedAt`).
2. Fix the agent that put personal data in the payload.
3. Never copy the blocked payload into a log or an issue.
