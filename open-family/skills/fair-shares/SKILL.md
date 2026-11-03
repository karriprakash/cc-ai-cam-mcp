---
name: fair-shares
description: Allocating contribution points that depend only on the idea, never on when it arrived.
---

# Fair shares

Tool: `allocateShares(scores, marketSimilarity)` in `tools/shares.mjs`. It refuses any third argument, so a time or order input cannot sneak in.

## Formula

| Part | Weight | Source |
|---|---|---|
| Originality | 35 | 1 minus market similarity |
| Women's impact | 30 | City brain |
| Feasibility | 20 | City brain |
| Clarity | 15 | City brain |

Points = the sum of each part (0 to 1) times its weight, from 0 to 100.

## Promises

- **No early bonus, no late penalty.** The same idea scores the same on day 1 and day 1000.
- **Enhancements count.** If the idea exists, originality is lower, but impact, feasibility and clarity still earn points.
- **Points are not money.**
- **Tamper-evident.** Each entry in the ledger includes the hash of the one before it. `ledger.verify()` finds any edit.
