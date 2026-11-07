import type { McpModule } from "./_shared/types.js";
import trustadda from "./trustadda/tools.js";
import mypgspace from "./mypgspace/tools.js";
import omnivideo from "./omnivideo/tools.js";
import socialPush from "./social-push/tools.js";
// new-mcp:imports

/** Every idea MCP. Each is served at /<slug>/mcp and runnable with `npm run mcp -- <slug>`. */
export const MCPS: McpModule[] = [
  trustadda,
  mypgspace,
  omnivideo,
  socialPush,
  // new-mcp:list
];
