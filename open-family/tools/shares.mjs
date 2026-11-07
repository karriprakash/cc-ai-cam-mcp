// fair-shares tool: turns an assessed idea into contribution points.
// Rules the family promises every contributor:
//   1. Points depend only on the idea. Submission time and order are never inputs,
//      so an early idea gets no more and a late idea gets no less.
//   2. If the idea already exists in the market or the family, it is scored as an enhancement:
//      the contributor earns points for what her version adds.
//   3. Points are a record of contribution, not money. Nobody pays and nobody is paid.

export const WEIGHTS = { originality: 0.35, womenImpact: 0.3, feasibility: 0.2, clarity: 0.15 };
export const ENHANCEMENT_THRESHOLD = 0.5;

const clamp = (x) => Math.max(0, Math.min(1, Number(x) || 0));

/**
 * @param {{womenImpact:number, feasibility:number, clarity:number}} scores  0..1 from the brain
 * @param {number} marketSimilarity  0..1 from market-check
 * @returns {{points:number, mode:"original"|"enhancement", breakdown:object}}
 */
export function allocateShares(scores, marketSimilarity) {
  if (arguments.length > 2) throw new Error("allocateShares takes only the idea's scores and market similarity; time-based inputs are not allowed.");
  const sim = clamp(marketSimilarity);
  const mode = sim >= ENHANCEMENT_THRESHOLD ? "enhancement" : "original";
  const parts = {
    originality: 1 - sim,
    womenImpact: clamp(scores.womenImpact),
    feasibility: clamp(scores.feasibility),
    clarity: clamp(scores.clarity),
  };
  const breakdown = {};
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    breakdown[k] = Math.round(parts[k] * w * 100);
    total += breakdown[k];
  }
  return { points: total, mode, breakdown };
}
