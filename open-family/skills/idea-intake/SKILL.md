---
name: idea-intake
description: Turning a phone call, voice note or WhatsApp message into an idea the family can review.
---

# Idea intake

## Channels

| Channel | What arrives | What intake does |
|---|---|---|
| `call` | Audio of the call | Speech-to-text, then the steps below |
| `voice-note` | Audio file | Speech-to-text, then the steps below. Delete the audio after transcription; never store it with code |
| `whatsapp` | Text or a voice note | Text goes straight in; a voice note is transcribed |

The runtime receives the transcript. Plug your speech-to-text and WhatsApp Business integration in front of `IntakeAgent.accept()`.

## Steps

1. Replace the contact with a pseudonym. Keep the real contact in the vault.
2. Run `privacy-shield` on the text.
3. Send `idea.submitted` to the city.
4. Reply at once: "Thank you. Your idea reached the family."

## What a good idea record has

- What problem it solves, and for whom
- How it would work, in a sentence or two
- Why it matters to women in her place

If the transcript is very short, the city's clarity score will be low. Intake may ask one follow-up question, in her language.
