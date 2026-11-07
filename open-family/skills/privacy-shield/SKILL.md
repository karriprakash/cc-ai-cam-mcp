---
name: privacy-shield
description: Removing personal data so a contributor can never be identified, located or contacted by anyone outside her city's intake agent.
---

# Privacy shield

Tool: `redact(text)` in `tools/redact.mjs` returns `{text, removed}`. `removed` lists only the kinds that were removed, never the values.

## What is removed

| Kind | Replaced with | Notes |
|---|---|---|
| Aadhaar number | `[ID]` | Checked with the Verhoeff checksum to avoid false alarms |
| Phone number | `[PHONE]` | 10 to 13 digits, with or without a country code |
| Email | `[EMAIL]` | |
| GPS coordinates | `[LOCATION]` | |

## Known gaps

- Names and street addresses are not detected yet. Ask contributors not to say them, and add a named-entity step before production.
- Audio files can carry metadata. Strip it, or never keep the audio.

## Why it matters

A leaked number can lead to stalking or harassment. The bus double-checks every upward hop, so a mistake here is stopped before it travels.
