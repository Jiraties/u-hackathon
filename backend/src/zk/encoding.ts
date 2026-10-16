import { scoreHundredths, fixedWeightedScore } from '../../shared/scoringMath.js';
import { randomBytes } from 'node:crypto';
import { encodeAbiParameters, sha256, type Hex } from 'viem';
import type { AdmissionRulebook, ScoreRecord } from '../../shared/domain.js';
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
import { ZK_SUBJECTS, zkPolicyErrors } from '../../shared/zkPolicy.js';
export const SUBJECTS=ZK_SUBJECTS;
export const fieldHex = (n: bigint | string | number): Hex => {
  const value = BigInt(n); if (value < 0 || value >= FIELD) throw new Error('non_canonical_field');
  return `0x${value.toString(16).padStart(64,'0')}`;
};
export const freshField = () => fieldHex(BigInt(`0x${randomBytes(31).toString('hex')}`) || 1n);
export const halves = (value: Hex) => [BigInt(value) >> 128n, BigInt(value) & ((1n<<128n)-1n)];
export const roundCode = (round: string) => {
  const match = /^Round ([1-4])$/.exec(round); if (!match) throw new Error('zk_unsupported_round'); return Number(match[1]);
};
export const hundredths = scoreHundredths;
export type Policy = { intake:Hex; round:number; version:number; subjects:readonly number[]; weights:readonly number[]; minimums:readonly number[] };
export const policyFromRule = (rule: AdmissionRulebook, intake: Hex): Policy => {
  if (zkPolicyErrors(rule).length) throw new Error('zk_unsupported_policy');
  if (rule.components.length !== 3 || rule.qualifications.length || rule.method !== 'normalized-weighted-sum' || rule.components.some(c=>c.maximum!==100 || c.source!=='demo-exam-provider' || c.transformation!=='normalize-to-100' || !SUBJECTS[c.scoreId]) || rule.requiredSubjects.some(id=>!rule.components.some(c=>c.scoreId===id))) throw new Error('zk_unsupported_policy_use_three_exam_subjects_on_100_point_scales_without_curriculum');
  const components = [...rule.components].sort((a,b)=>SUBJECTS[a.scoreId]-SUBJECTS[b.scoreId]);
  const policy = { intake, round:roundCode(rule.round), version:rule.version, subjects:components.map(c=>SUBJECTS[c.scoreId]), weights:components.map(c=>hundredths(c.weightPercent)), minimums:components.map(c=>hundredths(c.minimumPercent??0)) };
  if(new Set(policy.subjects).size!==3 || policy.weights.some(w=>w===0) || policy.weights.reduce((a,b)=>a+b,0)!==10000) throw new Error('zk_invalid_weights');
  return policy;
};
export const scoringPolicyHash = (year:number, capacity:number, p:Policy):Hex => sha256(encodeAbiParameters(
  [{type:'uint256'},{type:'bytes32'},{type:'uint32'},{type:'uint32'},{type:'uint32'},{type:'uint32'},{type:'uint32[3]'},{type:'uint32[3]'},{type:'uint32[3]'}],
  [1n,p.intake,year,capacity,p.round,p.version,p.subjects as [number,number,number],p.weights as [number,number,number],p.minimums as [number,number,number]]));
export const versionedProgramId = (p:Policy):Hex => sha256(encodeAbiParameters([{type:'bytes32'},{type:'uint32'}],[p.intake,p.version]));
export const normalizedScores = (records: readonly ScoreRecord[], subjects: readonly number[]) => subjects.map(subject=>{
  const matches=records.filter(s=>SUBJECTS[s.id]===subject);
  if(matches.length!==1 || matches[0].maximum!==100) throw new Error('zk_missing_or_unsupported_exam_score');
  return hundredths(matches[0].score);
});
export const fixedScore = (scores:readonly number[], p:Policy) => ({
  total: fixedWeightedScore(scores,p.weights),
  eligible:scores.every((v,i)=>v>=p.minimums[i]),
});
