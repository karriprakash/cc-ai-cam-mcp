---
name: market-check
description: Deciding whether an idea is new or an enhancement of something that already exists, in the market or in the family.
---

# Market check

Tool: `marketCheck(text, familyIdeas)` in `tools/market.mjs` returns the closest matches with a similarity from 0 to 1.

- For points, it compares only against the outside market (a seed catalog of common product categories). It never compares against earlier family ideas, because that would give a later contributor fewer points just for arriving second.
- Similar ideas inside the family are handled separately: the council introduces the two cities so they can build together (`collab.introduce`).
- Similarity is word overlap (Jaccard), so it is fast and explainable.
- A similarity of 0.5 or more means the idea is an **enhancement**. The contributor still earns points for what she adds.

## Improving it

- Add categories to `SEED_CATALOG` as the family learns what exists.
- With `FAMILY_BRAIN=claude`, the city brain also proposes up to three enhancements for each idea.
