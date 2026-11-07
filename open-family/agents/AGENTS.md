# The open-source family of agents

Women send ideas by phone call, voice note or WhatsApp. A family of agents carries each idea from her city to the whole world. It keeps her private, gives her fair contribution points, and connects her with women who have similar ideas in other countries.

## Levels

```
Global Family Council (agents/global)        one, the parent of everyone
 └─ Country (agents/country)                 one per country
     └─ City (agents/city)                   one per city
         └─ Intake (agents/intake)           one per city, talks to contributors
```

Each level's `AGENTS.md` has frontmatter the runtime reads:

| Key | Meaning |
|---|---|
| `level` | Which class runs it: `global`, `country`, `city`, `intake` |
| `parent` | The level above |
| `skills` | Skill files in `skills/<name>/SKILL.md` this level follows |
| `tools` | Tools this level may call. Calling any other tool throws an error |
| `sends` / `receives` | Message types this level sends and handles |

The family's shape, meaning which countries and cities exist, lives in `family.json`. To add a place, run `node scripts/spawn-node.mjs --country KE --country-name Kenya --city KE-mombasa --city-name Mombasa`. It updates `family.json` and writes the new node's own `AGENTS.md` under `agents/nodes/`.

## How agents talk

Every message follows the tree. It goes up from the sender to the closest shared parent, then down to the receiver.

- **Parent and child** talk directly.
- **Sibling cities** in one country talk through their country.
- **Cities in different countries** talk through both countries and the global council.

So parents always know what their family is doing, and nobody is left out of the loop. See `skills/family-messaging/SKILL.md` for every message type.

## Family promises

1. **Privacy first.** A contributor's phone number, email, ID number and location stay inside her city's intake agent. The bus checks every upward hop and stops any message that carries personal data, then alerts the global council.
2. **Fair points, any time.** Points depend only on the idea. An early idea gets no bonus and a late idea gets no penalty. An idea that already exists earns points for the enhancement it adds.
3. **No money.** Points record contribution. Nobody pays to join and nobody is paid.
4. **Joint family.** When two cities have similar ideas, the council introduces them so they can build together.
5. **Open source.** Every agent, skill and tool is plain code and markdown anyone can read, fork and improve.
