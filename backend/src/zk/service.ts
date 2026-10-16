import { authenticatedCohort } from './authenticatedCohort.js';
import type { AdmissionRulebook, PreviewApplicant } from '../../shared/domain.js';
import { rulebookCommitment } from '../../shared/domain.js';
import type { Hex } from 'viem';
import type { ChainGateway } from '../chain.js';
import type { ResultDoc, Store } from '../store.js';
import { ScoringProver } from './prover.js';
import { policyFromRule, normalizedScores, roundCode, scoringPolicyHash, halves, fixedScore } from './encoding.js';
export class ScoringService {
  private engine?:Promise<ScoringProver>;
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private store:Store,private chain:ChainGateway){}
  private prover(){return this.engine??=ScoringProver.create();}
  async cohort(rules:AdmissionRulebook[], applicants:PreviewApplicant[]) {
    return authenticatedCohort(this.store,this.chain,await this.prover(),rules,applicants);
  }
  async close(){if(this.engine)await(await this.engine).close();}
  async verify(doc:ResultDoc,programId:Hex){
    const task=this.tail.then(()=>this.verifyOne(doc,programId));this.tail=task.catch(()=>undefined);return task;
  }
  private async verifyOne(doc:ResultDoc,programId:Hex){
    if(this.chain.info.protocolVersion!==2)throw new Error('zk_registry_upgrade_required');
    const program=await this.store.programs.findOne({_id:programId});
    if(!program?.rulebook || !doc.report.preferences.includes(programId))throw new Error('zk_program_not_in_result');
    const p=await this.chain.read('scoringPolicy',[programId]);
    const policy=policyFromRule(program.rulebook,p.intake);
    const rulesHash=scoringPolicyHash(program.year,program.capacity,policy);
    if(rulesHash!==await this.chain.read('scoringRulesHash',[programId]))throw new Error('zk_policy_mismatch');
    const candidates=await this.store.examDatasets.find({year:doc.report.academicYear,round:roundCode(doc.report.round)}).toArray();
    let selected:typeof candidates[number]|undefined;
    let record:typeof candidates[number]['records'][number]|undefined;
    for(const d of candidates){
      const onchain=await this.chain.read('datasets',[d._id]);
      // New roots supersede older datasets; scoringInputs checks expiry, revocation,
      // provenance and current version again immediately before the transaction.
      const match=d.records.find(r=>r.studentId===doc.studentId && r.subject===doc.subject && r.subjects.join(',')===policy.subjects.join(','));
      if(match && BigInt(d.root)===onchain[0] && !onchain[6] && Number(onchain[4])>Date.now()/1000 && (!selected || d.version>selected.version)){selected=d;record=match;}
    }
    if(!selected||!record)throw new Error('authenticated_exam_record_required');
    const source=doc.report.scoreRecords;
    if(!source || normalizedScores(source,policy.subjects).some((value,i)=>value!==record!.scores[i]))throw new Error('result_scores_do_not_match_authenticated_exam_record');
    const existing=doc.scoring?.[programId];
    const engine=await this.prover();
    const statement=await engine.statement(selected,record,policy,{chainId:this.chain.info.chainId,registry:this.chain.info.contractAddress,program:programId,rulesHash,resultId:doc.resultId},existing?.totalSalt);
    const values=[doc.resultId,programId,selected._id,doc.subject,statement.context[15],statement.context[16],statement.calculated.eligible];
    const expected=await this.chain.read('scoringInputs',values);
    if(expected.some((v:Hex,i:number)=>BigInt(v)!==BigInt(statement.context[i])))throw new Error('zk_public_input_mismatch');
    const claim=await this.chain.read('scoreClaims',[doc.resultId,programId]);
    let receipt=existing?.verification,proofMs=existing?.proofMs;
    if(!claim[6] || claim[1]!==selected._id){
      const generated=await engine.prove(statement);proofMs=generated.proofMs;
      // Persist blinded total before broadcast, allowing a crash/retry to recover.
      const entry={datasetId:selected._id,rulesHash,total:statement.calculated.total,totalSalt:statement.totalSalt,totalCommitment:statement.context[16],nullifier:statement.context[15],eligible:statement.calculated.eligible,proofMs};
      await this.store.results.updateOne({_id:doc._id},{$set:{[`scoring.${programId}`]:entry}});
      receipt=await this.chain.write('issuer','verifyScoring',[...values,generated.proof]);
      await this.store.results.updateOne({_id:doc._id},{$set:{[`scoring.${programId}.verification`]:receipt}});
    }else if(claim[0]!==doc.subject || claim[1]!==selected._id || claim[2]!==rulesHash || claim[4]!==statement.context[16])throw new Error('zk_existing_claim_mismatch');
    return {status:'verified' as const,programId,ruleVersion:policy.version,datasetId:selected._id,eligible:statement.calculated.eligible,calculatedScore:statement.calculated.total/100,totalCommitment:statement.context[16],verification:receipt??null,proofMs:proofMs??null};
  }
  async evidence(doc:ResultDoc){
    if(this.chain.info.protocolVersion!==2)return [];
    const output=[];
    for(const programId of doc.report.preferences){
      const saved=doc.scoring?.[programId];
      const program=await this.store.programs.findOne({_id:programId});
      const programName=program?.rulebook?.programName;
      if(!saved){output.push({programId,programName,status:'not_verified',reason:'A scoring proof has not been verified.'});continue;}
      try{
        const claim=await this.chain.read('scoreClaims',[doc.resultId,programId]);
        const policy=await this.chain.read('scoringPolicy',[programId]);
        const verified=claim[6]>0n && claim[0]===doc.subject && claim[1]===saved.datasetId && claim[2]===saved.rulesHash && claim[3]===saved.nullifier && claim[4]===saved.totalCommitment && claim[5]===saved.eligible;
        // Check the current root/authority/policy and the private total opening.
        await this.chain.read('scoringInputs',[doc.resultId,programId,saved.datasetId,doc.subject,saved.nullifier,saved.totalCommitment,saved.eligible]);
        const engine=await this.prover();
        const opening=await engine.fold([saved.total,Number(saved.eligible),saved.totalSalt,...halves(doc.subject),...halves(programId),...halves(saved.rulesHash),...halves(doc.resultId)],1004);
        const calc=program?.rulebook ? fixedScore(normalizedScores(doc.report.scoreRecords??[],policy.subjects),policy):null;
        const published=await this.chain.read('programs',[programId]);
        const reportRule=doc.report.rulebooks?.find(r=>r.programId===program?.rulebook?.programId);
        const rulesMatch=!!reportRule && !!program?.rulebook && await rulebookCommitment(reportRule)===published[6] && scoringPolicyHash(program.year,program.capacity,policyFromRule(reportRule,policy.intake))===saved.rulesHash;
        output.push({programId,programName,status:rulesMatch&&verified&&opening===saved.totalCommitment&&calc?.total===saved.total&&calc?.eligible===saved.eligible?'verified':'not_verified',eligible:saved.eligible,calculatedScore:saved.total/100,ruleVersion:policy.version,datasetId:saved.datasetId,totalCommitment:saved.totalCommitment,verification:saved.verification??null,verifiedAt:String(claim[6]),allocationCorrectness:'not_verified'});
      }catch{output.push({programId,programName,status:'not_verified',reason:'The proof, dataset or rulebook could not be confirmed as current.'});}
    }
    return output;
  }
}
