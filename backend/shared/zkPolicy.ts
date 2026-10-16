import type { AdmissionRulebook } from './domain.js';
export const ZK_SUBJECTS:Record<string,number>={tgat:1,tpat1:2,tpat2:3,tpat3:4,tpat4:5,tpat5:6,math1:7,physics:8,english:9};
export const zkPolicyErrors=(rule:AdmissionRulebook):string[]=>{
  const errors=[];
  if(rule.components.length!==3)errors.push('Private verification supports exactly three exam subjects.');
  if(rule.components.some(c=>c.maximum!==100||c.source!=='demo-exam-provider'||!ZK_SUBJECTS[c.scoreId]||c.transformation!=='normalize-to-100'))errors.push('Use supported exam subjects, each scored out of 100. GPAX and custom scales are not supported by this proof.');
  if(rule.qualifications.length)errors.push('Curriculum requirements are not covered by this proof. Select any curriculum to publish this version.');
  if(!/^Round [1-4]$/.test(rule.round))errors.push('Choose Round 1, Round 2, Round 3 or Round 4.');
  if(rule.components.some(c=>[c.weightPercent,c.minimumPercent??0].some(v=>!Number.isFinite(v)||Math.abs(v*100-Math.round(v*100))>1e-7)))errors.push('Use at most two decimal places for weights and minimum score requirements.');
  return errors;
};
