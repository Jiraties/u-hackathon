import fs from 'node:fs';
import { z } from 'zod';
import { createDemoScenario, definitionDigest, DEFINITION_ID } from './scenario.js';
const hex=z.string().regex(/^0x[0-9a-fA-F]{64}$/),address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const receipt=z.object({chainId:z.literal(43113),contractAddress:address,transactionHash:hex,blockNumber:z.string().regex(/^\d+$/)}).strict();
/** Public-only schema. No reports, student mappings, scores, salts, witnesses or sessions. */
export const evidenceManifestSchema=z.object({schema:z.literal(1),definitionId:z.literal(DEFINITION_ID),definitionDigest:hex,instanceId:z.string().regex(/^[a-zA-Z0-9-]{1,40}$/),chainId:z.literal(43113),registry:address,verifier:address,verificationKeySha256:z.string().regex(/^[a-f0-9]{64}$/),deploymentBlock:z.string().regex(/^\d+$/),recordedAt:z.iso.datetime(),
  evidence:z.array(z.object({kind:z.enum(['program','dataset','scoring','result','confirmation','credential','status']),reference:hex,receipt}).strict()).min(1),
}).strict().superRefine((m,ctx)=>{
  if(m.definitionDigest!==definitionDigest)ctx.addIssue({code:'custom',message:'Scenario definition changed'});
  for(const e of m.evidence)if(e.receipt.contractAddress.toLowerCase()!==m.registry.toLowerCase()||BigInt(e.receipt.blockNumber)<BigInt(m.deploymentBlock))ctx.addIssue({code:'custom',message:'Cross-registry or pre-deployment evidence'});
});
export type EvidenceManifest=z.infer<typeof evidenceManifestSchema>;
export function loadReplayManifest(file:string|undefined){return file?evidenceManifestSchema.parse(JSON.parse(fs.readFileSync(file,'utf8'))):null;}
export const PERSPECTIVES=['university','authority','student','verifier'] as const;
export function scenarioProjection(perspective:typeof PERSPECTIVES[number],instanceId:string,manifest:EvidenceManifest|null){
  const scenario=createDemoScenario(instanceId);
  const common={definitionId:DEFINITION_ID,definitionDigest,instanceId,fictional:true,mode:'read_only_replay',writesAllowed:false,evidenceStatus:manifest?'recorded_evidence_requires_chain_check':'not_prepared',allocationCorrectness:'not_independently_verified',evidence:manifest??null};
  // Explicit fixture allowlist: production collections are never queried here.
  switch(perspective){
    case 'university':return {...common,rulebooks:scenario.rulebooks,institutionName:scenario.institutionName};
    case 'authority':return {...common,algorithm:scenario.allocation,expectedAssignments:scenario.expected.map(s=>({name:s.name,programId:s.programId})),inputSource:'authorized_examination_dataset_required'};
    case 'student':return {...common,students:scenario.expected,subjects:scenario.applicants.map((s,i)=>({name:scenario.expected[i].name,scores:s.scores,preferences:s.preferences})),outcomeSource:'expected_fixture_outcomes_not_live_results'};
    case 'verifier':return {...common,verificationScope:['credential_status','issuer_authorization','scoring_claim_when_available'],holderIdentityVerified:false};
  }
}
