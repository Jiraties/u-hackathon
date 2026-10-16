/** Circuit arithmetic: score hundredths times weight basis points, half-up to hundredths. */
export const scoreHundredths = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw new Error('zk_requires_hundredth_point_scores');
  return Math.round(value * 100);
};
export const fixedWeightedScore = (scores: readonly number[], weights: readonly number[]) => {
  if (scores.length !== weights.length || !scores.length || scores.some(v => !Number.isInteger(v) || v < 0 || v > 10000) || weights.some(v => !Number.isInteger(v) || v <= 0 || v > 10000) || weights.reduce((a,b)=>a+b,0) !== 10000) throw new Error('invalid_fixed_scoring_inputs');
  return Math.floor((scores.reduce((sum, score, i) => sum + score * weights[i], 0) + 5000) / 10000);
};
