import { z } from 'zod';
const programSchema = z.object({ id: z.string(), capacity: z.number().int().min(1), minimumScore: z.number().min(0).max(100), weights: z.record(z.string(), z.number().int().min(0).max(10000)) })
  .refine(p => Object.values(p.weights).reduce((a, b) => a + b, 0) === 10000, 'Weights sum to 10000');
const applicantSchema = z.object({ id: z.string(), scores: z.record(z.string(), z.number().min(0).max(100).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8, 'At most two decimals')), preferences: z.array(z.string()).min(1).max(10) });
export type SimProgram = z.infer<typeof programSchema>;
export type SimApplicant = z.infer<typeof applicantSchema>;
export function calculateScore(scores: Record<string, number>, weights: Record<string, number>) {
  let sum = 0;
  for (const [subject, weight] of Object.entries(weights)) {
    if (!Number.isFinite(scores[subject])) throw new Error(`Missing score: ${subject}`);
    sum += Math.round(scores[subject] * 100) * weight;
  }
  // Integer hundredths, half-up rounding; weights in basis points.
  return Math.floor((sum + 5000) / 10000) / 100;
}
/** Fictional student-proposing deferred acceptance; NOT the official TCAS engine.
 * Program rankings use weighted score descending, then opaque applicant ID ASCII ascending.
 */
export function simulate(programInput: SimProgram[], applicantInput: SimApplicant[]) {
  const programs = z.array(programSchema).parse(programInput);
  const applicants = z.array(applicantSchema).parse(applicantInput);
  const byProgram = new Map(programs.map(p => [p.id, p]));
  if (byProgram.size !== programs.length || new Set(applicants.map(a => a.id)).size !== applicants.length) throw new Error('Duplicate ID');
  for (const a of applicants) {
    if (new Set(a.preferences).size !== a.preferences.length || a.preferences.some(p => !byProgram.has(p))) throw new Error('Invalid preferences');
  }
  const next = new Map(applicants.map(a => [a.id, 0]));
  const held = new Map(programs.map(p => [p.id, [] as SimApplicant[]]));
  const queue = [...applicants].sort((a, b) => a.id < b.id ? -1 : 1);
  while (queue.length) {
    const a = queue.shift()!;
    const rank = next.get(a.id)!;
    if (rank >= a.preferences.length) continue;
    next.set(a.id, rank + 1);
    const p = byProgram.get(a.preferences[rank])!;
    if (calculateScore(a.scores, p.weights) < p.minimumScore) { queue.push(a); continue; }
    const candidates = [...held.get(p.id)!, a].sort((left, right) =>
      calculateScore(right.scores, p.weights) - calculateScore(left.scores, p.weights) || (left.id < right.id ? -1 : 1));
    held.set(p.id, candidates.slice(0, p.capacity));
    queue.push(...candidates.slice(p.capacity));
  }
  return applicants.map(a => {
    const admitted = programs.find(p => held.get(p.id)!.some(candidate => candidate.id === a.id));
    return { studentId: a.id, outcome: admitted ? 'admitted' as const : 'not_admitted' as const, programId: admitted?.id ?? null,
      trace: a.preferences.map(programId => {
        const p = byProgram.get(programId)!; const calculatedScore = calculateScore(a.scores, p.weights);
        return { programId, calculatedScore, eligible: calculatedScore >= p.minimumScore,
          explanation: calculatedScore < p.minimumScore ? 'Below fictional eligibility threshold' :
            admitted?.id === programId ? 'Selected by fictional deferred acceptance' :
              admitted && a.preferences.indexOf(admitted.id) < a.preferences.indexOf(programId) ? 'Higher preference selected' : 'Not selected after fictional capacity-limited matching' };
      }) };
  });
}
