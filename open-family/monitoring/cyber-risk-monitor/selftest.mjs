#!/usr/bin/env node
// Self-test: plants fake leaks in a temp folder and checks the monitor catches each one,
// and that clean text does not raise false alarms.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(process.env.SCRATCH || tmpdir(), "crm-selftest-"));
const fx = join(dir, "fixtures");
execFileSync("mkdir", ["-p", fx]);

// Valid-checksum Aadhaar-format test number built with the Verhoeff algorithm (not a real person's).
const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const inv = [0,4,3,2,1,5,6,7,8,9];
const base = "23456789012";
let c = 0; [...base].reverse().forEach((x, i) => { c = d[c][p[(i + 1) % 8][+x]]; });
const aadhaar = base + inv[c];

writeFileSync(join(fx, "leaky.js"), [
  `const key = "AKIA${"ABCDEFGHIJKLMNOP"}";`,
  `const token = "ghp_${"a".repeat(36)}";`,
  `password = "${"Sup3rS3cretValue!"}"`,
  `// caller: +91 98765 43210`,
  `// id ${aadhaar}`,
  `// mail: priya.test@gmail.com`,
  `// seen at 17.385044, 78.486671`,
].join("\n"));
writeFileSync(join(fx, "clean.js"), "const total = 123456789012; // order id, fails Aadhaar checksum\nconst v = '1.2.3';\nconsole.log('hello@example.com');\n");
writeFileSync(join(fx, "voice-note.opus"), Buffer.alloc(2048));
writeFileSync(join(fx, "photo.jpg"), Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0x88, 0x25]), Buffer.alloc(100)]));

writeFileSync(join(dir, "config.json"), JSON.stringify({ endpoints: [], mcpServers: [], scanPaths: [fx], scanIgnore: [], tlsWarnDays: 21, riskRegister: JSON.parse(readFileSync(join(here, "config.json"), "utf8")).riskRegister }));
execFileSync("node", [join(here, "monitor.mjs"), join(dir, "config.json"), "--out", join(dir, "out")], { stdio: "ignore" });
const findings = JSON.parse(readFileSync(join(dir, "out", "findings.json"), "utf8"));
const risks = JSON.parse(readFileSync(join(dir, "out", "risks.json"), "utf8"));

const has = (title, file) => findings.some((f) => f.title === title && f.asset.includes(file));
const cases = [
  ["Detects AWS access key", has("AWS access key found", "leaky.js")],
  ["Detects GitHub token", has("GitHub token found", "leaky.js")],
  ["Detects hard-coded password", has("Hard-coded credential found", "leaky.js")],
  ["Detects Indian mobile number", has("Indian mobile number found", "leaky.js")],
  ["Detects Aadhaar number (valid checksum)", has("Aadhaar number found", "leaky.js")],
  ["Detects personal email", has("Email address found", "leaky.js")],
  ["Detects GPS coordinates", has("GPS coordinates found", "leaky.js")],
  ["Flags raw voice note", has("Raw media file in repository", "voice-note.opus")],
  ["Flags photo with GPS metadata", has("Photo with GPS location in repository", "photo.jpg")],
  ["No false alarms on clean file", !findings.some((f) => f.asset.includes("clean.js"))],
  ["Masks leaked values in report", !findings.some((f) => f.detail.includes("98765 43210") || f.detail.includes(aadhaar))],
  ["Doxxing risk R1 marked failing", risks.find((r) => r.id === "R1").control === "failing"],
  ["Secrets risk R3 marked failing", risks.find((r) => r.id === "R3").control === "failing"],
];
const rows = cases.map(([name, ok]) => ({ suite: "Cyber risk monitor", test: name, result: ok ? "pass" : "fail" }));
rmSync(dir, { recursive: true, force: true });
for (const r of rows) console.log(`${r.result.toUpperCase().padEnd(5)} ${r.test}`);
mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "out", "selftest.json"), JSON.stringify(rows, null, 2));
const failed = rows.filter((r) => r.result === "fail").length;
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exitCode = failed ? 1 : 0;
