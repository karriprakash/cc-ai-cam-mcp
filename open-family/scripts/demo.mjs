#!/usr/bin/env node
// Runs the family end to end with example contributions and prints who talked to whom.
// All contributors and numbers below are made up for the demo.
import { buildFamily } from "../runtime/family.mjs";

const fam = buildFamily({ salt: "demo-salt" });
const { bus, root } = fam;

await root.announce("Welcome to the family. Send your idea by call, voice note or WhatsApp.");

await fam.intake("IN-kakinada").accept({
  channel: "voice-note",
  contact: "+91 90000 00001",
  text: "A WhatsApp voice helpline where rural women in self-help groups learn Java skills in Telugu from volunteer mentors, so they can return to a career after a break. Call me on +91 90000 00001.",
});
await fam.intake("KE-nairobi").accept({
  channel: "whatsapp",
  contact: "+254 700 000001",
  text: "WhatsApp voice lessons where rural women in self-help groups learn coding skills from volunteer mentors so they can return to a career.",
});
await fam.intake("BR-sao-paulo").accept({
  channel: "voice-note",
  contact: "+55 11 90000 0001",
  text: "Women safety SOS button that shares live location with trusted contacts, but works offline over SMS for areas with no data.",
});

// Sibling cities helping each other: Kakinada asks Hyderabad for a robotics mentor, via India.
await bus.send({ from: "IN-kakinada", to: "IN-hyderabad", type: "help.request", payload: { field: "robotics" } });

// A mistake: a city tries to send a phone number upward. The bus stops it.
await bus.send({ from: "IN-hyderabad", to: "IN", type: "idea.review", payload: { note: "call her at 9000000002" } });

console.log("\nConversation (route of each delivered message)");
for (const m of bus.transcript) console.log(`  ${m.type.padEnd(17)} ${[m.from, ...m.hops].join(" → ")}`);

console.log("\nBlocked messages:", bus.blocked.map((b) => `${b.type} stopped at ${b.stoppedAt}`).join("; ") || "none");
console.log("Safety alerts at the council:", root.alerts.length);

console.log("\nLedger (points depend only on the idea)");
for (const e of root.ledger.entries) console.log(`  #${e.seq} ${e.contributor} ${e.city.padEnd(13)} ${String(e.points).padStart(3)} points  ${e.mode}${e.matchedWith ? `  (closest: ${e.matchedWith})` : ""}`);
console.log("  Ledger intact:", root.ledger.verify().ok);

console.log("\nWhat contributors hear back (Kakinada intake outbox)");
for (const o of fam.intake("IN-kakinada").outbox) console.log(`  [${o.channel}] ${o.text}`);

console.log("\nMentor offers Kakinada received:", JSON.stringify(fam.agent("IN-kakinada").offers));
