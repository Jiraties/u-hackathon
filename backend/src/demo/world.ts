import type {DemoWorldSnapshot} from '../../shared/demoWorld.js';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,http,keccak256,encodeDeployData,decodeEventLog,encodeAbiParameters,type Hex,type Address,type Abi,ContractFunctionRevertedError} from 'viem';
import {Noir} from '@noir-lang/noir_js';
import {createDemoScenario} from './scenario.js';
import {loadReplayManifest,type EvidenceManifest} from './replay.js';
import type {Config} from '../config.js';
import type {Store} from '../store.js';
import type {ChainGateway} from '../chain.js';
import {ScoringService} from '../zk/service.js';
import {ScoringProver} from '../zk/prover.js';
import {policyFromRule,scoringPolicyHash} from '../zk/encoding.js';
import {linkBytecode} from '../zk/artifacts.js';
import {commitment} from '../crypto.js';
import {rulebookCommitment} from '../../shared/domain.js';

const sha=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const statuses=['not_found','valid','enrolled','withdrawn','revoked'] as const;
function fail(reason:string):never{throw new Error(reason);}
const artifact=(name:string)=>JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8')) as {abi:Abi;bytecode:Hex;linkReferences?:Record<string,Record<string,{start:number;length:number}[]>>};
export class DemoWorldService {
  readonly client;
  private cached?:{until:number;value:DemoWorldSnapshot};
  private inFlight?:Promise<DemoWorldSnapshot>;
  private prover?:Promise<ScoringProver>;
  private validated?:EvidenceManifest;
  private experimentTail:Promise<unknown>=Promise.resolve();
  constructor(private config:Config,private store:Store,private chain:ChainGateway,private scoring:ScoringService){this.client=createPublicClient({transport:http(config.RPC_URL??'http://127.0.0.1:9',{timeout:12000,retryCount:0})});}
  async close(){if(this.prover)await(await this.prover).close();}
  private engine(){return this.prover??=ScoringProver.create();}
  snapshot():Promise<DemoWorldSnapshot>{
    if(this.cached&&this.cached.until>Date.now())return Promise.resolve(this.cached.value);
    return this.inFlight??=(async()=>{try{const value=await this.build();this.cached={until:Date.now()+(this.config.DEMO_READ_ONLY?300000:15000),value};return value;}finally{this.inFlight=undefined;}})();
  }
  private preparation(reason='Fuji V2 deployment awaits approval.',state:'not_prepared'|'unavailable'='not_prepared'):DemoWorldSnapshot{
    return {scenario:createDemoScenario(this.config.DEMO_WORLD_INSTANCE??'preparation'),state,reason,mode:'preparation' as const,observedAt:new Date().toISOString(),network:null,programs:[],students:[],dataset:null,manifest:null,securityAvailable:false};
  }
  async reconcile(manifest:EvidenceManifest){
    if(!manifest.bindings||!manifest.roles||!manifest.deployments)fail('Incomplete evidence bindings');
    if(manifest.chainId!==this.chain.info.chainId||manifest.registry.toLowerCase()!==this.chain.info.contractAddress.toLowerCase()||manifest.instanceId!==this.config.DEMO_WORLD_INSTANCE)fail('Evidence belongs to another scenario or network');
    if(manifest.verificationKeySha256!==sha('../zk/scoring/target/vk'))fail('Verification key fingerprint mismatch');
    if(await this.client.getChainId()!==manifest.chainId||await this.chain.read('protocolVersion')!==2n||(await this.chain.read('scoringVerifier')).toLowerCase()!==manifest.verifier.toLowerCase())fail('V2 verifier mismatch');
    const libraries=Object.fromEntries(manifest.deployments.map(d=>[d.name,d.address as Address]));
    if(new Set(manifest.deployments.map(d=>d.name)).size!==4||libraries.FairPassRegistryV2?.toLowerCase()!==manifest.registry.toLowerCase()||libraries.HonkVerifier?.toLowerCase()!==manifest.verifier.toLowerCase())fail('Deployment addresses mismatch');
    const deploymentCheck=async(d:NonNullable<EvidenceManifest['deployments']>[number])=>{
      const a=artifact(d.name);const args=d.name==='FairPassRegistryV2'?[manifest.roles!.admin,manifest.roles!.authority,manifest.roles!.exam,manifest.verifier]:[];
      const [code,tx,r]=await Promise.all([this.client.getCode({address:d.address as Address}),this.client.getTransaction({hash:d.transactionHash as Hex}),this.client.getTransactionReceipt({hash:d.transactionHash as Hex})]);
      if(!code||keccak256(code)!==d.runtimeCodeHash||r.status!=='success'||r.contractAddress?.toLowerCase()!==d.address.toLowerCase()||String(r.blockNumber)!==d.blockNumber||tx.from.toLowerCase()!==manifest.roles!.admin.toLowerCase()||tx.input!==encodeDeployData({abi:a.abi,bytecode:linkBytecode(a,libraries),args}))fail('Deployed code or creation transaction mismatch');
    };
    await Promise.all(manifest.deployments.map(deploymentCheck));
    if(manifest.security)await deploymentCheck(manifest.security.deployment);
    const abi=artifact('FairPassRegistryV2').abi;
    // Bound RPC concurrency; receipts may be shared by more than one event.
    const receipts=new Map<string,Awaited<ReturnType<typeof this.client.getTransactionReceipt>>>();
    for(const item of manifest.evidence){
      let receipt=receipts.get(item.receipt.transactionHash);
      if(!receipt){receipt=await this.client.getTransactionReceipt({hash:item.receipt.transactionHash as Hex});receipts.set(item.receipt.transactionHash,receipt);}
      if(receipt.status!=='success'||String(receipt.blockNumber)!==item.receipt.blockNumber)fail('Unconfirmed or inconsistent evidence receipt');
      const canonical=await this.client.getBlock({blockNumber:receipt.blockNumber});
      if(canonical.hash!==receipt.blockHash)fail('Evidence block is no longer canonical');
      const log=receipt.logs.find(l=>l.logIndex===item.logIndex&&l.address.toLowerCase()===manifest.registry.toLowerCase());
      if(!log)fail('Evidence event missing');
      const event=decodeEventLog({abi,data:log.data,topics:log.topics}) as unknown as {eventName:string;args:Record<string,unknown>};
      if(event.eventName!==item.eventName)fail('Evidence event identifier mismatch');
      const reference=item.kind==='credential'||item.kind==='status'?event.args.credentialId:event.args.program??event.args.dataset??event.args.resultId;
      // ScoringVerified has both resultId and program: resultId is its primary reference.
      const primary=event.eventName==='ScoringVerified'?event.args.resultId:reference;
      if(primary!==item.reference||(item.programId&&event.args.program!==item.programId))fail('Evidence reference mismatch');
    }
    return true;
  }
  private async build():Promise<DemoWorldSnapshot>{
    if(!this.config.DEMO_WORLD_INSTANCE||!this.config.DEMO_REPLAY_MANIFEST)return this.preparation();
    try{
      const manifest=loadReplayManifest(this.config.DEMO_REPLAY_MANIFEST);if(!manifest)return this.preparation('Preparing the local scenario and its real proof records.');
      await this.reconcile(manifest);
      const bindings=manifest.bindings!,scenario=createDemoScenario(manifest.instanceId);
      const run=await this.store.runs.findOne({_id:scenario.runId});
      if(!run?.completedAt||run.authenticatedInput?.datasetId!==bindings.datasetId||JSON.stringify(run.assignments)!==JSON.stringify(Object.fromEntries(scenario.expected.map(e=>[e.studentId,e.programId]))))fail('Scenario allocation snapshot mismatch');
      const current=await this.chain.read('datasets',[bindings.datasetId]);
      const dataset=await this.store.examDatasets.findOne({_id:bindings.datasetId as Hex});
      if(!dataset||BigInt(dataset.root)!==current[0]||run.authenticatedInput.datasetRoot!==dataset.root)fail('Dataset commitment mismatch');
      const context=keccak256(encodeAbiParameters([{type:'uint32'},{type:'uint32'}],[2027,3]));
      const examRole=await this.chain.read('EXAM_AUTHORITY');
      const datasetCurrent=!current[6]&&Number(current[4])>Date.now()/1000&&await this.chain.read('latestDataset',[context])===bindings.datasetId&&await this.chain.read('hasRole',[examRole,current[5]]);
      const programs=[];
      for(const [i,id]of bindings.programIds.entries()){
        const doc=await this.store.programs.findOne({_id:id as Hex});const live=await this.chain.read('programs',[id]);
        if(!doc?.rulebook||await rulebookCommitment(scenario.rulebooks[i])!==live[6]||await rulebookCommitment(doc.rulebook)!==live[6]||!live[7])fail('Published scenario rulebook mismatch');
        const policy=await this.chain.read('scoringPolicy',[id]);
        if(scoringPolicyHash(doc.year,doc.capacity,policyFromRule(doc.rulebook,policy.intake))!==await this.chain.read('scoringRulesHash',[id]))fail('Scoring policy mismatch');
        programs.push({id,rulebook:doc.rulebook,capacity:live[2] as number,active:live[3] as number,issuer:live[0] as string,lockedAt:String(live[7]),registration:doc.registration??null,lock:doc.lock??null,current:await this.chain.read('intakeHead',[policy.intake])===id});
      }
      const students=[];
      for(const [i,expected]of scenario.expected.entries()){
        const binding=bindings.students.find(s=>s.id===expected.studentId);if(!binding)fail('Student binding missing');
        const doc=await this.store.results.findOne({resultId:binding.resultId as Hex,studentId:expected.studentId});
        if(!doc||doc.report.runId!==scenario.runId||doc.credentialId!==binding.credentialId||doc.report.outcome!==(expected.programId?'admitted':'not_admitted'))fail('Student result snapshot mismatch');
        for(const score of scenario.applicants[i].scores)if(doc.report.scoreRecords?.find(s=>s.id===score.id)?.score!==score.score)fail('Student examination record mismatch');
        const expectedProgram=expected.programId?bindings.programIds[scenario.rulebooks.findIndex(r=>r.programId===expected.programId)]:null;
        if(doc.report.programId!==expectedProgram||JSON.stringify(doc.report.preferences)!==JSON.stringify(scenario.applicants[i].preferences.map(p=>bindings.programIds[scenario.rulebooks.findIndex(r=>r.programId===p)])))fail('Student preference or allocation mismatch');
        const [hash,at]=await this.chain.read('resultCommitment',[doc.resultId]);
        if(!at||hash!==commitment(doc.report,doc.salt)||hash!==doc.commitment)fail('Result commitment mismatch');
        const scoring=(await this.scoring.evidence(doc)).map(e=>({...e,status:e.status==='verified'?'verified' as const:'not_verified' as const,programName:e.programName?.replace(/ · Fictional program$/,'')}));const credential=await this.chain.read('credential',[doc.credentialId]);
        const record={resultId:doc.resultId,report:doc.report,commitment:doc.commitment,confirmationRequestedAt:doc.confirmationRequestedAt?.toISOString()??null,publication:doc.publication??null,issuance:doc.issuance??null,scoring,
          program:expectedProgram?{institutionName:'Kasetsart University',programName:programs.find(p=>p.id===expectedProgram)!.rulebook.programName,rulebookId:programs.find(p=>p.id===expectedProgram)!.rulebook.id}:null,
          credential:credential[1]?{credentialId:doc.credentialId,programId:credential[0] as string,status:statuses[credential[1]],lifecycle:credential[1]===2?'enrolled':statuses[credential[1]]}:null};
        const proof={resultId:doc.resultId,report:doc.report,scheme:'fairpass-result-v1',verification:{resultIntegrity:'verified',scoreAuthenticity:scoring.every(s=>s.status==='verified')?'verified':'not_verified',allocationCorrectness:'not_verified'},scoring,onchainCommitment:hash as string,recordedAt:String(at),publication:doc.publication??null,...this.chain.info};
        students.push({id:expected.studentId,name:expected.name,wallet:{institutionName:'Kasetsart University',student:{id:expected.studentId,name:expected.name},records:[record],...this.chain.info},proof});
      }
      // Every verified claim must have its exact event receipt in the manifest.
      for(const student of students)for(const claim of student.proof.scoring){if(claim.status==='verified'&&!manifest.evidence.some(e=>e.kind==='scoring'&&e.reference===student.proof.resultId&&e.programId===claim.programId))fail('Scoring receipt missing');}
      const ruleCurrent=programs.every(p=>p.current);
      const has=(event:string,reference:string)=>manifest.evidence.some(e=>e.eventName===event&&e.reference===reference);
      if(!has('ExamDatasetCommitted',dataset._id)||programs.some(p=>!has('RulesLocked',p.id)||!has('ScoringPolicyRegistered',p.id))||students.some(s=>!has('ResultRecorded',s.proof.resultId)||(s.wallet.records[0].credential&&!has('RightIssued',s.wallet.records[0].credential!.credentialId))))fail('Required scenario receipt missing');
      if(datasetCurrent&&ruleCurrent&&students.some(s=>s.proof.scoring.length!==3||s.proof.scoring.some(e=>e.status!=='verified')))fail('Current scoring evidence does not reconcile');
      this.validated=manifest;
      return {scenario,state:datasetCurrent&&ruleCurrent?'verified' as const:'stale' as const,reason:datasetCurrent&&ruleCurrent?null:'Historical evidence remains available; its dataset or rule version is no longer current.',mode:manifest.chainId===43113?'fuji' as const:'local' as const,observedAt:new Date().toISOString(),network:this.chain.info,programs,students,dataset:{id:dataset._id,root:dataset.root,version:dataset.version,current:!!datasetCurrent,expiresAt:dataset.expiresAt,publication:dataset.publication??null},manifest,securityAvailable:!!manifest.security};
    }catch(error){console.error('Demo World reconciliation failed',error instanceof Error && /^[A-Za-z .-]+$/.test(error.message)?error.message:'RPC or cryptographic read failed');return this.preparation('Verification is unavailable. The scenario, contract or evidence could not be reconciled.','unavailable');}
  }
  async experiment(kind:'score'|'eligibility'|'capacity',score?:number){
    const snapshot=await this.snapshot();if(snapshot.state!=='verified'||!snapshot.securityAvailable)fail('Demo evidence is unavailable or stale');
    const task=this.experimentTail.then(async()=>{
      if(kind==='score'){
        const student=snapshot.students.find(s=>s.name==='Pim')!;
        const dataset=await this.store.examDatasets.findOne({_id:snapshot.dataset!.id as Hex});const record=dataset?.records.find(r=>r.studentId===student.id);if(!dataset||!record)fail('Authenticated record unavailable');
        const engine=await this.engine();const program=snapshot.programs[0];const policy=await this.chain.read('scoringPolicy',[program.id]);const statement=await engine.statement(dataset,record,policyFromRule(program.rulebook,policy.intake),{chainId:this.chain.info.chainId,registry:this.chain.info.contractAddress,program:program.id as Hex,rulesHash:await this.chain.read('scoringRulesHash',[program.id]),resultId:student.proof.resultId as Hex});
        statement.witnessInput.scores[0]=String(Math.round(score!*100));
        try{await new Noir(engine.circuit).execute(statement.witnessInput);return {kind:'circuit_constraint_check',outcome:'accepted',submittedTransaction:false,message:'The original scores satisfy the circuit.'};}
        catch(error){if(!(error instanceof Error)||!/(constraint|assertion)/i.test(error.message))throw error;return {kind:'circuit_constraint_check',outcome:'rejected',submittedTransaction:false,message:'Verification failed. The evidence doesn’t match.'};}
      }
      const m=this.validated!;const s=m.security!,fixture=kind==='eligibility'?s.ineligible:s.eligible;
      const abi=artifact('FairPassRegistryV2').abi;const target=s.deployment.address as Address;const current=s.callMode==='current';const blockNumber=current?undefined:BigInt(fixture.blockNumber);const programId=fixture.programId??s.programId;const at=current?{blockTag:'latest' as const}:{blockNumber:blockNumber!};
      const read=(functionName:string,args:readonly unknown[])=>this.client.readContract({address:target,abi,functionName,args,...at}) as Promise<any>;
      const [program,confirmed,claim]=await Promise.all([read('programs',[programId]),read('isConfirmed',[fixture.resultId]),read('scoreClaims',[fixture.resultId,programId])]);
      if(!confirmed||!claim[6]||(kind==='eligibility'&&(claim[5]||program[3]>=program[2]))||(kind==='capacity'&&(!claim[5]||program[3]<program[2])))fail('Security experiment preconditions mismatch');
      try{await this.client.simulateContract({address:target,abi,functionName:'issueRight',args:[fixture.credentialId,fixture.resultId],account:m.roles!.issuer as Address,...at});fail('Contract unexpectedly accepted the operation');}
      catch(error){const reverted=(error as {walk?:(fn:(e:unknown)=>boolean)=>unknown}).walk?.(e=>e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError|undefined;if(reverted?.data?.errorName!==fixture.expectedError)throw error;
        return {kind:current?'current_contract_call':'historical_contract_call',outcome:'rejected',submittedTransaction:false,error:fixture.expectedError,contractAddress:target,blockNumber:current?String(await this.client.getBlockNumber({cacheTime:0})):fixture.blockNumber,message:kind==='eligibility'?'The enforced eligibility rule blocked issuance.':'Both places are occupied. The contract blocked a third right.'};}
    });this.experimentTail=task.catch(()=>undefined);return task;
  }
}
export type {DemoWorldSnapshot} from '../../shared/demoWorld.js';
