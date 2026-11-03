import { makeHttpHandlers } from "../mcps/_shared/http.js";
import mod from "../mcps/social-push/tools.js";

export const { GET, POST, DELETE } = makeHttpHandlers(mod.createServer);
