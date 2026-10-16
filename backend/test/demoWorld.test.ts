import {test} from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createDemoScenario,definitionDigest,DEFINITION_ID} from '../src/demo/scenario.js';
import {evidenceManifestSchema,scenarioProjection,PERSPECTIVES} from '../src/demo/replay.js';
import {fixedWeightedScore} from '../shared/scoringMath.js';
import {calculateProgramScore,allocatePreview} from '../shared/domain.js';
import {createApp} from '../src/app.js';
import type {Config} from '../src/config.js';
import type {Store} from '../src/store.js';
import type {ChainGateway} from '../src/chain.js';

test('nine-student fixture is deterministic, isolated and has six offers plus both non-admitted explanations',()=>{
 const a=createDemoScenario('one'),b=createDemoScenario('two');
 assert.deepEqual(a,createDemoScenario('one'));assert.equal(a.expected.filter(s=>s.programId).length,6);
 for(const r of a.rulebooks)assert.equal(a.expected.filter(s=>s.programId===r.programId).length,2);
 assert.equal(a.expected.find(s=>s.name==='Narin')?.calculations.every(c=>c.status==='calculated'&&c.eligible),true);
 for(const name of ['Dao','Ton'])assert.equal(a.expected.find(s=>s.name===name)?.calculations.some(c=>c.status==='calculated'&&c.eligible),false);
 assert.ok(!a.applicants.some(s=>b.applicants.some(t=>s.id===t.id)));
 assert.ok(!a.rulebooks.some(s=>b.rulebooks.some(t=>s.programId===t.programId)));
 assert.throws(()=>createDemoScenario('../escape'));
});
test('rounding matches circuit integer half-up, with rounded ranking and deterministic tie break',()=>{
 assert.equal(fixedWeightedScore([1,0,0],[5000,2500,2500]),1);
 for(let n=0;n<200;n++){
  const scores=[n*43%10001,n*79%10001,n*97%10001];const weights=[2000,5000,3000];
  const calc=calculateProgramScore(scores.map((s,i)=>({id:String(i),subject:String(i),label:String(i),score:s/100,maximum:100,provenance:'simulated-exam-provider'})),weights.map((w,i)=>({scoreId:String(i),weightPercent:w/100})));
  assert.equal(calc.status==='calculated'?calc.total:null,fixedWeightedScore(scores,weights)/100);
 }
 const rule={...createDemoScenario('tie').rulebooks[0],capacity:1};
 const make=(id:string,value:number)=>({id,preferences:[rule.programId],qualifications:{},scores:rule.components.map((c,i)=>({id:c.scoreId,subject:c.scoreId,label:c.label,score:i===0?value:80,maximum:100,provenance:'simulated-exam-provider' as const}))});
 const applicants=[make('b',80.01),make('a',80)];
 assert.equal(allocatePreview([rule],applicants,{scorePrecision:'hundredths-half-up'}).a,rule.programId);
 assert.equal(allocatePreview([rule],applicants).b,rule.programId);
});
test('read-only projections never query production data, grant sessions or imply prepared evidence',async()=>{
 const app=createApp({ADMIN_API_TOKEN:'a'.repeat(32),ISSUER_API_TOKEN:'i'.repeat(32),INTEGRATION_API_TOKEN:'x'.repeat(32)} as Config,{} as Store,{info:{}} as ChainGateway);
 for(const role of PERSPECTIVES){
  const r=await request(app).get(`/v1/demo/scenarios/${DEFINITION_ID}/${role}`).expect(200);
  assert.equal(r.body.writesAllowed,false);assert.equal(r.body.evidenceStatus,'not_prepared');assert.equal(r.body.evidence,null);
  assert.ok(!JSON.stringify(r.body).includes('password'));assert.ok(!JSON.stringify(r.body).includes('privateKey'));
  await request(app).post(`/v1/demo/scenarios/${DEFINITION_ID}/${role}`).send({action:'issue'}).expect(404);
 }
 await request(app).post('/v1/office/simulations').send({}).expect(401);
 await request(app).post('/v1/issuer/results/0x123/issue').send({}).expect(401);
 const replayApp=createApp({DEMO_READ_ONLY:true,ADMIN_API_TOKEN:'a'.repeat(32)} as Config,{} as Store,{info:{}} as ChainGateway);
 for(const route of ['/v1/auth/institution/login','/v1/office/simulations','/v1/issuer/results/0x123/issue','/v1/admin/students'])await request(replayApp).post(route).send({}).expect(403);
 const base={schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId:'one',chainId:43113,registry:'0x'+'1'.repeat(40),verifier:'0x'+'2'.repeat(40),verificationKeySha256:'a'.repeat(64),deploymentBlock:'4',recordedAt:new Date().toISOString(),evidence:[{kind:'result',reference:'0x'+'3'.repeat(64),receipt:{chainId:43113,contractAddress:'0x'+'1'.repeat(40),transactionHash:'0x'+'4'.repeat(64),blockNumber:'5'}}]};
 assert.equal(evidenceManifestSchema.safeParse(base).success,true);
 assert.equal(evidenceManifestSchema.safeParse({...base,salt:'private'}).success,false);
 assert.equal(evidenceManifestSchema.safeParse({...base,definitionDigest:'0x'+'0'.repeat(64)}).success,false);
 assert.equal(evidenceManifestSchema.safeParse({...base,evidence:[{...base.evidence[0],receipt:{...base.evidence[0].receipt,contractAddress:'0x'+'9'.repeat(40)}}]}).success,false);
 const verifier=scenarioProjection('verifier','one',null);assert.equal('holderIdentityVerified' in verifier && verifier.holderIdentityVerified,false);
});

test('keyless chain gateway refuses writes before touching an RPC or private key',async()=>{
 const {createChain}=await import('../src/chain.js');
 const gateway=createChain({DEMO_READ_ONLY:true,REGISTRY_VERSION:2,CHAIN_ID:43113,RPC_URL:'http://127.0.0.1:9',CONTRACT_ADDRESS:'0x'+'1'.repeat(40),ISSUER_ADDRESS:'0x'+'2'.repeat(40),DEPLOYMENT_BLOCK:0n} as Config);
 await assert.rejects(gateway.write('issuer','issueRight',[]),/read_only_replay/);
 assert.equal(gateway.issuer,'0x'+'2'.repeat(40));
});

test('instant frontend preview contains only the canonical fictional scenario, not verified records',()=>{
 const preview=JSON.parse(fs.readFileSync('../web/src/demo/preview.json','utf8'));
 const canonical=createDemoScenario('fuji-replay-001');
 for(const key of Object.keys(preview))assert.deepEqual(preview[key],(canonical as any)[key]);
 assert.equal('students' in preview,false);assert.equal('manifest' in preview,false);assert.equal('securityAvailable' in preview,false);
});
