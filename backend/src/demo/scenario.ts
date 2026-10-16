import { allocatePreview, evaluateRulebook, type AdmissionRulebook, type PreviewApplicant } from '../../shared/domain.js';
import { rulesCommitment } from '../crypto.js';
export const DEFINITION_ID = 'fairpass-demo-world-v1';
export const ALLOCATION_VERSION = 'authority-deferred-acceptance-rounded-hundredths-id-ascending-v1';
export const SCENARIO_SUBJECTS = ['tgat','math1','physics'] as const;
const students = [
  {id:'01-arun',name:'Arun',scores:[90,94,89],preferences:['ce','ds','ee'],expected:'ce'},
  {id:'02-pim',name:'Pim',scores:[88.25,92.50,85.75],preferences:['ce','ds','ee'],expected:'ce'},
  {id:'03-mali',name:'Mali',scores:[85,88,80],preferences:['ce','ds','ee'],expected:'ds'},
  {id:'04-krit',name:'Krit',scores:[82,86,88],preferences:['ee','ce','ds'],expected:'ee'},
  {id:'05-fah',name:'Fah',scores:[80,82,84],preferences:['ds','ee','ce'],expected:'ds'},
  {id:'06-beam',name:'Beam',scores:[78,80,79],preferences:['ee','ds','ce'],expected:'ee'},
  {id:'07-narin',name:'Narin',scores:[72,75,73],preferences:['ce','ds','ee'],expected:null},
  {id:'08-dao',name:'Dao',scores:[49,93,90],preferences:['ce','ds','ee'],expected:null},
  {id:'09-ton',name:'Ton',scores:[75,49,85],preferences:['ee','ds','ce'],expected:null},
] as const;
const programs = [
  {id:'ce',name:'Computer Engineering',faculty:'Engineering',weights:[20,50,30],minimums:[50,60,50]},
  {id:'ds',name:'Data Science',faculty:'Science',weights:[30,50,20],minimums:[50,55,50]},
  {id:'ee',name:'Electrical Engineering',faculty:'Engineering',weights:[20,30,50],minimums:[50,55,60]},
] as const;
export const definitionDigest = rulesCommitment({schema:1,id:DEFINITION_ID,allocation:ALLOCATION_VERSION,subjects:SCENARIO_SUBJECTS,students,programs,year:2027,round:'Round 3'});
export function createDemoScenario(instanceId:string) {
  if(!/^[a-zA-Z0-9-]{1,40}$/.test(instanceId))throw new Error('invalid_scenario_instance');
  const scope=`dw-${instanceId}`;
  const rulebooks:AdmissionRulebook[]=programs.map(p=>({
    id:`${scope}-${p.id}-v1`,programId:`${scope}-${p.id}`,institutionId:'fairpass-demo',programName:`${p.name} · Fictional program`,faculty:`Faculty of ${p.faculty}`,degree:'Bachelor of Science / Engineering',academicYear:2027,round:'Round 3',capacity:2,version:1,method:'normalized-weighted-sum',
    components:SCENARIO_SUBJECTS.map((id,i)=>({scoreId:id,label:['TGAT','Mathematics 1','Physics'][i],source:'demo-exam-provider',sourceComponentId:id,maximum:100,transformation:'normalize-to-100',weightPercent:p.weights[i],minimumPercent:p.minimums[i]})),
    requiredSubjects:[...SCENARIO_SUBJECTS],qualifications:[],status:'draft',createdAt:'2026-10-16T00:00:00.000Z',sealedAt:null,commitment:null,chainReference:null,publication:null,
  }));
  const applicants:PreviewApplicant[]=students.map(s=>({id:`${scope}-${s.id}`,preferences:s.preferences.map(p=>`${scope}-${p}`),qualifications:{},scores:SCENARIO_SUBJECTS.map((id,i)=>({id,subject:id,label:id,score:s.scores[i],maximum:100,provenance:'simulated-exam-provider'}))}));
  const assignments=allocatePreview(rulebooks,applicants,{scorePrecision:'hundredths-half-up'});
  for(const [i,student]of students.entries())if(assignments[applicants[i].id] !== (student.expected?`${scope}-${student.expected}`:null))throw new Error('scenario_outcome_drift');
  return {schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId,fictional:true as const,institutionName:'Kasetsart University (fictional demonstration)',academicYear:2027,round:'Round 3',allocation:{version:ALLOCATION_VERSION,correctness:'not_independently_verified',precision:'hundredths-half-up',tieBreak:'opaque-applicant-id-ascending'},runId:`${scope}-allocation-v1`,rulebooks,applicants,
    expected:students.map((s,i)=>({studentId:applicants[i].id,name:s.name,programId:assignments[applicants[i].id],calculations:rulebooks.map(r=>({programId:r.programId,...evaluateRulebook(r,applicants[i].scores)}))}))};
}
