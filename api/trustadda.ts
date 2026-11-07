import { makeHttpHandlers } from "../mcps/_shared/http.js";
import mod from "../mcps/trustadda/tools.js";

export const { GET, POST, DELETE } = makeHttpHandlers(mod.createServer);
