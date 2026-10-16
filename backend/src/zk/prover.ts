import fs from 'node:fs';
import path from 'node:path';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { type Hex } from 'viem';
import { fieldHex, freshField, halves, fixedScore, type Policy } from './encoding.js';
export type PrivateExamRecord = { studentId:string; subject:Hex; recordVersion:number; salt:Hex; subjects:number[]; scores:number[]; leaf:Hex; index:number; siblings:Hex[] };
export type PrivateDataset = { _id:Hex; root:Hex; year:number; round:number; version:number; expiresAt:number; records:PrivateExamRecord[]; publication?:import('../chain.js').ChainReference };
export class ScoringProver {
  private constructor(readonly api:Barretenberg, readonly circuit:CompiledCircuit, readonly backend:UltraHonkBackend) {}
  static async create() {
    const circuit=JSON.parse(fs.readFileSync(path.resolve('../zk/scoring/target/fairpass_scoring.json'),'utf8')) as CompiledCircuit;
    const api=await Barretenberg.new({threads:1,srsSize:65536});
    return new ScoringProver(api,circuit,new UltraHonkBackend(circuit.bytecode,api));
  }
  async close(){await this.api.destroy();}
  async compress(a:bigint|string,b:bigint|string,domain:number):Promise<Hex>{
    const inputs=[a,b,domain,3n<<64n].map(n=>Uint8Array.from(Buffer.from(fieldHex(n).slice(2),'hex')));
    const {outputs}=await this.api.poseidon2Permutation({inputs});return `0x${Buffer.from(outputs[0]).toString('hex')}`;
  }
  async fold(values:readonly (bigint|string|number)[],domain:number){let acc=fieldHex(domain);for(const v of values)acc=await this.compress(acc,String(v),domain);return acc;}
  async leaf(d:Pick<PrivateDataset,'year'|'round'|'version'>,r:Pick<PrivateExamRecord,'subject'|'recordVersion'|'salt'|'subjects'|'scores'>){
    return this.fold([d.year,d.round,d.version,...halves(r.subject),r.recordVersion,r.salt,...r.subjects,...r.scores],1001);
  }
  async dataset(meta:Omit<PrivateDataset,'root'|'records'>, inputs:Omit<PrivateExamRecord,'leaf'|'index'|'siblings'>[]):Promise<PrivateDataset>{
    if(!inputs.length || inputs.length>256 || new Set(inputs.map(r=>`${r.studentId}:${r.subjects.join(',')}`)).size!==inputs.length)throw new Error('invalid_exam_dataset_size_or_duplicates');
    const records:PrivateExamRecord[]=[];
    for(const [index,r]of inputs.entries()){
      if(r.subjects.length!==3 || r.scores.length!==3 || r.subjects.some((v,i)=>!Number.isInteger(v)||v<=0||(i>0&&v<=r.subjects[i-1])) || r.scores.some(v=>!Number.isInteger(v)||v<0||v>10000) || !Number.isInteger(r.recordVersion)||r.recordVersion<1 || BigInt(r.salt)===0n)throw new Error('invalid_private_exam_record');
      records.push({...r,index,leaf:await this.leaf(meta,r),siblings:[]});
    }
    const levels:Hex[][]=[[...records.map(r=>r.leaf),...Array(256-records.length).fill(fieldHex(0))]];
    for(let depth=0;depth<8;depth++){
      const row=levels[depth],next:Hex[]=[];
      for(let i=0;i<row.length;i+=2)next.push(await this.compress(row[i],row[i+1],1002));
      levels.push(next);
    }
    for(const r of records)for(let depth=0;depth<8;depth++)r.siblings.push(levels[depth][(r.index>>depth)^1]);
    return {...meta,root:levels[8][0],records};
  }
  async statement(d:PrivateDataset,r:PrivateExamRecord,p:Policy,scope:{chainId:number;registry:Hex;program:Hex;rulesHash:Hex;resultId:Hex},totalSalt=freshField()){
    if(p.subjects.join(',')!==r.subjects.join(','))throw new Error('exam_subjects_do_not_match_policy');
    const calculated=fixedScore(r.scores,p);
    const context=[BigInt(scope.chainId),BigInt(scope.registry),BigInt(d.root),BigInt(d.year),BigInt(d.round),BigInt(d.version),...halves(scope.program),BigInt(p.version),...halves(scope.rulesHash),...halves(scope.resultId),...halves(r.subject),0n,0n,BigInt(calculated.eligible),...p.subjects.map(BigInt),...p.weights.map(BigInt),...p.minimums.map(BigInt)];
    context[15]=BigInt(await this.fold([context[0],context[1],context[3],context[4],context[6],context[7],context[8],context[9],context[10],await this.leaf(d,r)],1003));
    context[16]=BigInt(await this.fold([calculated.total,context[17],totalSalt,context[13],context[14],context[6],context[7],context[9],context[10],context[11],context[12]],1004));
    return {context:context.map(fieldHex),totalSalt,calculated,witnessInput:{context:context.map(n=>n.toString()),scores:r.scores.map(String),record_salt:r.salt,record_version:String(r.recordVersion),siblings:r.siblings,leaf_index:String(r.index),total:String(calculated.total),total_salt:totalSalt}};
  }
  async prove(input:Awaited<ReturnType<ScoringProver['statement']>>){
    const started=performance.now();
    const {witness}=await new Noir(this.circuit).execute(input.witnessInput);
    const proof=await this.backend.generateProof(witness,{verifierTarget:'evm'});
    if(proof.publicInputs.length!==27 || proof.publicInputs.some((v,i)=>BigInt(v)!==BigInt(input.context[i])))throw new Error('unexpected_prover_public_inputs');
    if(!await this.backend.verifyProof(proof,{verifierTarget:'evm'}))throw new Error('proof_failed_local_verification');
    return {proof:`0x${Buffer.from(proof.proof).toString('hex')}` as Hex,publicInputs:input.context,proofMs:performance.now()-started,rssMiB:process.memoryUsage().rss/1024/1024};
  }
}
