// The family message bus.
// Every message travels along the tree: up from the sender to the closest shared parent, then down.
// So a city talking to a city in another country passes through its country, the global council
// and the other country. Each parent on the way sees the message, which keeps the family informed.
// Each upward hop is checked by the guardian: a message carrying personal data is stopped.
import { randomUUID } from "node:crypto";
import { payloadHasPII } from "../tools/redact.mjs";

export class Bus {
  constructor() {
    this.agents = new Map();
    this.transcript = [];
    this.blocked = [];
  }

  register(agent) {
    if (this.agents.has(agent.id)) throw new Error(`Agent ${agent.id} already registered`);
    this.agents.set(agent.id, agent);
    agent.bus = this;
  }

  ancestors(id) {
    const chain = [];
    let cur = this.agents.get(id);
    if (!cur) throw new Error(`Unknown agent ${id}`);
    while (cur) { chain.push(cur.id); cur = cur.parentId ? this.agents.get(cur.parentId) : null; }
    return chain;
  }

  /** Path of agent ids from `from` to `to`, through their lowest common ancestor. */
  path(from, to) {
    const up = this.ancestors(from);
    const down = this.ancestors(to);
    const lca = up.find((a) => down.includes(a));
    if (!lca) throw new Error(`No shared ancestor for ${from} and ${to}`);
    return [...up.slice(0, up.indexOf(lca) + 1), ...down.slice(0, down.indexOf(lca)).reverse()];
  }

  isUpward(a, b) { return this.agents.get(a)?.parentId === b; }

  async send({ from, to, type, payload = {} }) {
    const msg = { id: randomUUID(), from, to, type, payload, at: new Date().toISOString(), hops: [] };
    const route = this.path(from, to);
    for (let i = 1; i < route.length; i++) {
      const [prev, here] = [route[i - 1], route[i]];
      if (this.isUpward(prev, here) && payloadHasPII(payload)) {
        this.blocked.push({ ...msg, stoppedAt: prev, reason: "personal data in an upward message" });
        // Raise a safety alert to the global council, with no payload content.
        if (type !== "safety.alert") await this.send({ from: prev, to: this.root(), type: "safety.alert", payload: { reason: "Blocked a message carrying personal data", messageType: type, stoppedAt: prev } });
        return { delivered: false, blockedAt: prev };
      }
      msg.hops.push(here);
      const agent = this.agents.get(here);
      if (i < route.length - 1) agent.observe?.(msg);
    }
    this.transcript.push(msg);
    const target = this.agents.get(to);
    const reply = await target.receive(msg);
    return { delivered: true, reply };
  }

  root() { for (const a of this.agents.values()) if (!a.parentId) return a.id; throw new Error("No root agent"); }
  childrenOf(id) { return [...this.agents.values()].filter((a) => a.parentId === id).map((a) => a.id); }
}
