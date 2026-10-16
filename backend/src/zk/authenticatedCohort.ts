import { encodeAbiParameters, keccak256, type Hex } from 'viem';
import type { AdmissionRulebook, PreviewApplicant } from '../../shared/domain.js';
import type { Store } from '../store.js';
import type { ChainGateway } from '../chain.js';
import { ScoringProver } from './prover.js';
import { policyFromRule, roundCode, SUBJECTS } from './encoding.js';

/** Authenticate the source before allocation. Caller-supplied scores are never used. */
export async function authenticatedCohort(store: Store, chain: ChainGateway, prover: ScoringProver, rules: AdmissionRulebook[], applicants: PreviewApplicant[]) {
  const year = rules[0].academicYear, round = roundCode(rules[0].round);
  const context = keccak256(encodeAbiParameters([{type:'uint32'},{type:'uint32'}],[year,round]));
  const datasetId = await chain.read('latestDataset',[context]) as Hex;
  const dataset = await store.examDatasets.findOne({_id:datasetId});
  if (!dataset) throw new Error('authenticated_exam_record_required');
  const d = await chain.read('datasets',[datasetId]);
  const role = await chain.read('EXAM_AUTHORITY');
  if (d[0] !== BigInt(dataset.root) || d[1] !== year || d[2] !== round || d[3] !== dataset.version || dataset.year !== year || dataset.round !== round || d[6] || Number(d[4]) <= Date.now()/1000 || !await chain.read('hasRole',[role,d[5]])) throw new Error('authenticated_exam_dataset_not_current');
  // Rebuild the actual records: a matching saved root cannot authenticate altered DB scores.
  const rebuilt = await prover.dataset(dataset,dataset.records);
  if (rebuilt.root !== dataset.root) throw new Error('authenticated_exam_dataset_mismatch');
  const policies = rules.map(r => policyFromRule(r,`0x${'1'.repeat(64)}`));
  const subjects = policies[0].subjects;
  if (policies.some(p=>p.subjects.join(',')!==subjects.join(','))) throw new Error('authenticated_cohort_requires_shared_subjects');
  const cohort: PreviewApplicant[] = [];
  for (const applicant of applicants) {
    const matches = rebuilt.records.filter(r => r.studentId === applicant.id && r.subjects.join(',') === subjects.join(','));
    if (matches.length !== 1) throw new Error('authenticated_exam_record_required');
    const record = matches[0];
    const subject = await store.subject(applicant.id,year,record.subject);
    if (subject !== record.subject) throw new Error('authenticated_exam_subject_mismatch');
    cohort.push({id:applicant.id,preferences:[...applicant.preferences],qualifications:{},scores:subjects.map((subject,i)=>{
      const id = Object.keys(SUBJECTS).find(id=>SUBJECTS[id]===subject)!;
      return {id,subject:id,label:rules[0].components.find(c=>c.scoreId===id)!.label,score:record.scores[i]/100,maximum:100,provenance:'simulated-exam-provider'};
    })});
  }
  return { applicants:cohort, datasetId, datasetRoot:dataset.root, datasetVersion:dataset.version, precision:'hundredths-half-up' as const };
}
