// Scaffolds a new idea MCP in seconds:
//   npm run new-mcp -- <slug> "<one-line idea>"
// Creates mcps/<slug>/tools.ts and api/<slug>.ts, registers it in mcps/index.ts,
// adds the /<slug>/mcp rewrite to vercel.json and a row to README.md.
// Then fill in the tools and run `npm run smoke:all -- <slug>`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug, ...ideaParts] = process.argv.slice(2);
const idea = ideaParts.join(" ").trim();

if (!slug || !/^[a-z][a-z0-9-]{1,30}$/.test(slug) || !idea) {
  console.error('Usage: npm run new-mcp -- <slug> "<one-line idea>"   (slug: lowercase letters, digits, dashes)');
  process.exit(1);
}
const dir = join(root, "mcps", slug);
if (existsSync(dir)) { console.error(`mcps/${slug} already exists.`); process.exit(1); }

const ident = slug.replace(/-(.)/g, (_, c: string) => c.toUpperCase());
const title = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const json = (s: string) => JSON.stringify(s);

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "tools.ts"), `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpModule } from "../_shared/types.js";
import { callApi, fail, ok } from "../_shared/result.js";

// ${title}: ${idea}
// Tools give the model data, actions and exact checks; the model writes the prose.

// const api = () => process.env.${slug.toUpperCase().replace(/-/g, "_")}_API_URL;

function createServer(): McpServer {
  const server = new McpServer({ name: ${json(slug + "-mcp")}, version: "0.1.0" });

  // TODO: replace with the idea's real tools (3-7 is the sweet spot).
  server.registerTool("describe_idea", {
    title: "Describe idea",
    description: "Explain what this MCP is for and which tools it offers.",
    inputSchema: { detail: z.enum(["short", "full"]).default("short") },
  }, async ({ detail }) => ok(detail === "short" ? ${json(idea)} : { idea: ${json(idea)}, tools: ["describe_idea"] }));

  void callApi; void fail; // remove once real tools use them
  return server;
}

const mod: McpModule = {
  slug: ${json(slug)},
  title: ${json(title)},
  description: ${json(idea)},
  env: {},
  createServer,
  examples: [{ tool: "describe_idea", args: { detail: "short" } }],
};
export default mod;
`);

writeFileSync(join(root, "api", `${slug}.ts`), `import { makeHttpHandlers } from "../mcps/_shared/http.js";
import mod from "../mcps/${slug}/tools.js";

export const { GET, POST, DELETE } = makeHttpHandlers(mod.createServer);
`);

const indexPath = join(root, "mcps", "index.ts");
let index = readFileSync(indexPath, "utf8");
index = index
  .replace("// new-mcp:imports", `import ${ident} from "./${slug}/tools.js";\n// new-mcp:imports`)
  .replace("  // new-mcp:list", `  ${ident},\n  // new-mcp:list`);
writeFileSync(indexPath, index);

const vercelPath = join(root, "vercel.json");
const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
vercel.rewrites.push({ source: `/${slug}/mcp`, destination: `/api/${slug}` });
writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const marker = "<!-- new-mcp:row -->";
if (readme.includes(marker)) {
  writeFileSync(readmePath, readme.replace(marker, `| \`${slug}\` | ${idea} | \`/${slug}/mcp\` |\n${marker}`));
}

console.log(`Created mcps/${slug}/tools.ts and api/${slug}.ts, registered /${slug}/mcp.
Next:
  1. Write the real tools in mcps/${slug}/tools.ts
  2. npm run typecheck && npm run smoke:all -- ${slug}
  3. Try it: claude mcp add ${slug} -- npx tsx ${join(root, "mcps/_shared/stdio.ts")} ${slug}`);
