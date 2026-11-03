// Builds the whole family from family.json: one global council, a node per country, a node per city,
// and an intake agent in every city.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Bus } from "./bus.mjs";
import { GlobalAgent, CountryAgent, CityAgent, IntakeAgent } from "./agents.mjs";
import { defaultBrain } from "./brain.mjs";

export const FAMILY_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "family.json");

export function buildFamily({ file = FAMILY_FILE, brain = defaultBrain(), salt, ledgerFile } = {}) {
  const tree = JSON.parse(readFileSync(file, "utf8"));
  const bus = new Bus();
  const root = new GlobalAgent({ id: tree.id, name: tree.name, ledgerFile });
  bus.register(root);
  for (const c of tree.countries || []) {
    bus.register(new CountryAgent({ id: c.id, name: c.name, parentId: root.id }));
    for (const city of c.cities || []) {
      bus.register(new CityAgent({ id: city.id, name: city.name, parentId: c.id, brain, profile: city }));
      bus.register(new IntakeAgent({ id: `${city.id}/intake`, name: `${city.name} intake`, parentId: city.id, salt, profile: { channels: city.channels } }));
    }
  }
  return { bus, root, agent: (id) => bus.agents.get(id), intake: (cityId) => bus.agents.get(`${cityId}/intake`) };
}
