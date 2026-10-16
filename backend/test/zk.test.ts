import {DemoWorldService} from '../src/demo/world.js';
import {ScoringService} from '../src/zk/service.js';
import {evidenceManifestSchema} from '../src/demo/replay.js';
import {definitionDigest,DEFINITION_ID} from '../src/demo/scenario.js';
import {createHash} from 'node:crypto';
import { createDemoScenario } from '../src/demo/scenario.js';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectStore } from '../src/store.js';
import { passwordHash } from '../src/crypto.js';
import type { Config } from '../src/config.js';
import type { ChainGateway } from '../src/chain.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, defineChain, http, type Hex, type Abi, type Address, decodeFunctionData,keccak256 } from 'viem';
import { ScoringProver } from '../src/zk/prover.js';
import { freshField, fieldHex, scoringPolicyHash, versionedProgramId, fixedScore, type Policy } from '../src/zk/encoding.js';
import { linkBytecode } from '../src/zk/artifacts.js';
import { randomId } from '../src/crypto.js';

test('real Noir ZK proof → Solidity verification → gated issuance; malicious witnesses and public inputs fail', { timeout:240000 }, async t=>{
  const node=spawn(process.execPath,['node_modules/hardhat/dist/src/cli.js','node','--hostname','127.0.0.1','--port','19545'],{stdio:['ignore','ignore','pipe']});
  let diagnostics='';node.stderr?.on('data',v=>{diagnostics=(diagnostics+v).slice(-2000);});t.after(()=>{node.kill('SIGTERM');});
  const chain=defineChain({id:31337,name:'ZK isolated test',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1:19545']}}});
  const client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0],{retryCount:0,timeout:1000})});
  const wallet=createWalletClient({chain,transport:http(chain.rpcUrls.default.http[0])});
  for(let i=0;i<100;i++){try{await client.getChainId();break;}catch{if(node.exitCode!==null)throw Error(diagnostics);await new Promise(r=>setTimeout(r,100));}}
  const accounts=await wallet.getAddresses();const [admin,authority,issuer,exam,stranger]=accounts;
  const metrics:Record<string,unknown>={toolchain:{noir:'1.0.0-rc.5',barretenberg:'5.2.1',target:'evm (zero knowledge enabled)'},gas:{}};
  const gas=metrics.gas as Record<string,string>;
  const artifact=(name:string)=>JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8')) as {abi:Abi;bytecode:Hex};
  const deployments:any[]=[];
  const libraries:Record<string,Address>={};
  const deploy=async(name:string,args:unknown[])=>{const a=artifact(name);const hash=await wallet.deployContract({account:admin,abi:a.abi,bytecode:linkBytecode(a,libraries),args});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');gas[`deploy_${name}`]=String(r.gasUsed);deployments.push({name,address:r.contractAddress,transactionHash:hash,blockNumber:String(r.blockNumber),runtimeCodeHash:keccak256((await client.getCode({address:r.contractAddress!}))!)});return r.contractAddress!;};
  libraries.RelationsLib=await deploy('RelationsLib',[]);
  libraries.ZKTranscriptLib=await deploy('ZKTranscriptLib',[]);
  const verifier=await deploy('HonkVerifier',[]);const registry=await deploy('FairPassRegistryV2',[admin,authority,exam,verifier]);
  const abi=artifact('FairPassRegistryV2').abi;
  const read=(functionName:string,args:unknown[]=[])=>client.readContract({address:registry,abi,functionName,args}) as Promise<any>;
  const write=async(account:Address,functionName:string,args:unknown[],label?:string)=>{const {request}=await client.simulateContract({address:registry,abi,functionName,args,account});const hash=await wallet.writeContract(request);const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');if(label)gas[label]=String(r.gasUsed);return r;};
  await write(admin,'authorizeInstitution',[issuer,true],'authorize_institution');
  const policy:Policy={intake:randomId(),round:3,version:1,subjects:[1,7,8],weights:[2000,4000,4000],minimums:[5000,5000,5000]};
  const program=versionedProgramId(policy),rulesHash=scoringPolicyHash(2027,1,policy);
  await assert.rejects(write(stranger,'registerScoringProgram',[program,2027,1,randomId(),policy]));
  await write(issuer,'registerScoringProgram',[program,2027,1,randomId(),policy],'publish_policy');
  await write(issuer,'lockRules',[program],'lock_rules');
  assert.equal(await read('scoringRulesHash',[program]),rulesHash);
  await assert.rejects(write(issuer,'registerProgram',[randomId(),2027,1,randomId()]));
  const prover=await ScoringProver.create();t.after(()=>prover.close());
  const dataset=await prover.dataset({_id:randomId(),year:2027,round:3,version:1,expiresAt:Math.floor(Date.now()/1000)+86400},[
    {studentId:'fictional-private-A',subject:randomId(),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:[8123,7345,9067]},
    {studentId:'fictional-private-B',subject:randomId(),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:[6789,7123,8456]},
    {studentId:'fictional-private-C',subject:randomId(),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:[4012,9123,8234]},
  ]);
  const rootArgs=[dataset._id,BigInt(dataset.root),2027,3,1,dataset.expiresAt];
  await assert.rejects(write(stranger,'commitExamDataset',rootArgs));
  await write(exam,'commitExamDataset',rootArgs,'commit_dataset');
  const id=randomId(),student=dataset.records[0];
  const statement=await prover.statement(dataset,student,policy,{chainId:31337,registry,program,rulesHash,resultId:id});
  const {Noir}=await import('@noir-lang/noir_js');const noir=new Noir(prover.circuit);
  for(const [name,patch]of [
    ['altered authenticated score',{scores:['8124','7345','9067']}],
    ['forged Merkle sibling',{siblings:[fieldHex(1),...student.siblings.slice(1)]}],
    ['incorrect weighted total',{total:String(statement.calculated.total+1)}],
    ['incorrect eligibility',{context:statement.witnessInput.context.map((v,i)=>i===17?'0':v)}],
    ['wrong student commitment',{context:statement.witnessInput.context.map((v,i)=>i===13?'1':v)}],
    ['wrong root',{context:statement.witnessInput.context.map((v,i)=>i===2?'1':v)}],
  ] as [string, Record<string, any>][]){await assert.rejects(noir.execute({...statement.witnessInput,...patch}),name);}
  const proof=await prover.prove(statement);metrics.proof={durationMs:proof.proofMs,serverRssMiB:proof.rssMiB,bytes:(proof.proof.length-2)/2,publicInputs:proof.publicInputs.length,note:'Server RSS sample; native prover child peak not included.'};
  const inputs=await read('scoringInputs',[id,program,dataset._id,student.subject,statement.context[15],statement.context[16],true]);
  assert.deepEqual(inputs.map((v:Hex)=>BigInt(v)),statement.context.map(BigInt));
  const args=[id,program,dataset._id,student.subject,statement.context[15],statement.context[16],true,proof.proof];
  await write(authority,'recordResult',[id,randomId(),student.subject,program,2027,true]);
  await assert.rejects(write(issuer,'issueRight',[randomId(),id])); // no confirmation or proof
  await write(authority,'confirmResult',[id]);
  await assert.rejects(write(issuer,'issueRight',[randomId(),id])); // confirmation alone insufficient
  await assert.rejects(write(stranger,'confirmResult',[id]));
  const corrupt=proof.proof.slice(0,-2)+(proof.proof.endsWith('00')?'01':'00');
  await assert.rejects(write(issuer,'verifyScoring',[...args.slice(0,7),corrupt]));
  await assert.rejects(write(issuer,'verifyScoring',[randomId(),...args.slice(1)]));
  await assert.rejects(write(issuer,'verifyScoring',[id,randomId(),...args.slice(2)]));
  await assert.rejects(write(issuer,'verifyScoring',[id,program,randomId(),...args.slice(3)]));
  await assert.rejects(write(issuer,'verifyScoring',[id,program,dataset._id,randomId(),...args.slice(4)]));
  await assert.rejects(write(issuer,'verifyScoring',[...args.slice(0,6),false,proof.proof]));
  const {compile,createFileManager}=await import('@noir-lang/noir_wasm');
  fs.mkdirSync('cache/incompatible-key/src',{recursive:true});
  fs.writeFileSync('cache/incompatible-key/Nargo.toml','[package]\nname="incompatible_key"\ntype="bin"\nauthors=[]\n');
  const originalSource=fs.readFileSync('../zk/scoring/src/main.nr','utf8');
  fs.writeFileSync('cache/incompatible-key/src/main.nr',originalSource.replace('assert(record_salt != 0);','assert(record_salt != 0); assert(record_salt != 1);'));
  const {program:otherCircuit}=await compile(createFileManager((await import('node:path')).resolve('cache/incompatible-key')));
  const {UltraHonkBackend}=await import('@aztec/bb.js');
  const otherWitness=await new Noir(otherCircuit).execute(statement.witnessInput);
  const incompatible=await new UltraHonkBackend(otherCircuit.bytecode,prover.api).generateProof(otherWitness.witness,{verifierTarget:'evm'});
  await assert.rejects(write(issuer,'verifyScoring',[...args.slice(0,7),`0x${Buffer.from(incompatible.proof).toString('hex')}`]));
  const receipt=await write(issuer,'verifyScoring',args,'verify_scoring');
  assert.equal((await read('scoreClaims',[id,program]))[5],true);
  await assert.rejects(write(issuer,'verifyScoring',args)); // replay
  const replayId=randomId();const replayStatement=await prover.statement(dataset,student,policy,{chainId:31337,registry,program,rulesHash,resultId:replayId});
  assert.equal(replayStatement.context[15],statement.context[15]);
  const replayProof=await prover.prove(replayStatement);
  await assert.rejects(write(issuer,'verifyScoring',[replayId,program,dataset._id,student.subject,replayStatement.context[15],replayStatement.context[16],true,replayProof.proof]));

  const right=randomId();await assert.rejects(write(stranger,'issueRight',[right,id]));
  await write(issuer,'issueRight',[right,id],'issue_right');
  await assert.rejects(write(issuer,'issueRight',[randomId(),id]));
  const id2=randomId(),s2=await prover.statement(dataset,dataset.records[1],policy,{chainId:31337,registry,program,rulesHash,resultId:id2}),p2=await prover.prove(s2);
  await write(issuer,'verifyScoring',[id2,program,dataset._id,dataset.records[1].subject,s2.context[15],s2.context[16],true,p2.proof]);
  await write(authority,'recordResult',[id2,randomId(),dataset.records[1].subject,program,2027,true]);await write(authority,'confirmResult',[id2]);
  const capacityBlock=String(await client.getBlockNumber({cacheTime:0}));
  await assert.rejects(write(issuer,'issueRight',[randomId(),id2])); // valid proof, capacity exhausted
  const id3=randomId(),s3=await prover.statement(dataset,dataset.records[2],policy,{chainId:31337,registry,program,rulesHash,resultId:id3}),p3=await prover.prove(s3);
  assert.equal(s3.calculated.eligible,false);
  await write(issuer,'verifyScoring',[id3,program,dataset._id,dataset.records[2].subject,s3.context[15],s3.context[16],false,p3.proof]);
  await write(authority,'recordResult',[id3,randomId(),dataset.records[2].subject,program,2027,true]);await write(authority,'confirmResult',[id3]);
  await write(issuer,'changeStatus',[right,3,randomId()]);await write(issuer,'authorizeReallocation',[program,1,randomId()]);
  const eligibilityBlock=String(await client.getBlockNumber({cacheTime:0}));
  await assert.rejects(write(issuer,'issueRight',[randomId(),id3])); // authenticated selection cannot override ineligible proof
  // Private scores are absent from public inputs, ABI calldata fields and events.
  assert.ok(student.scores.every(score=>!proof.publicInputs.some(v=>BigInt(v)===BigInt(score))));
  assert.ok(!proof.publicInputs.some(v=>BigInt(v)===BigInt(fixedScore(student.scores,policy).total)));
  const tx=await client.getTransaction({hash:receipt.transactionHash});const decoded=decodeFunctionData({abi,data:tx.input});assert.equal(decoded.functionName,'verifyScoring');
  assert.ok(!tx.input.includes(Buffer.from(student.studentId).toString('hex')));assert.ok(!tx.input.includes(student.salt.slice(2)));
  assert.ok(receipt.logs.every(log=>!log.data.includes(student.salt.slice(2))));
  // Wrong rule version is a different canonical statement, not a selectable prover input.
  const nextPolicy={...policy,version:2};await assert.rejects(write(issuer,'registerScoringProgram',[versionedProgramId(nextPolicy),2027,1,randomId(),nextPolicy])); // already issued
  const amendedBase={...policy,intake:randomId()};const oldProgram=versionedProgramId(amendedBase);
  await write(issuer,'registerScoringProgram',[oldProgram,2027,1,randomId(),amendedBase]);await write(issuer,'lockRules',[oldProgram]);
  // A real proof cannot move to another registered program with identical weights.
  await assert.rejects(write(issuer,'verifyScoring',[id,oldProgram,...args.slice(2)]));
  const amendment={...amendedBase,version:2};const newProgram=versionedProgramId(amendment);
  await write(issuer,'registerScoringProgram',[newProgram,2027,1,randomId(),amendment]);await write(issuer,'lockRules',[newProgram]);
  assert.equal(await read('intakeHead',[amendedBase.intake]),newProgram);
  await assert.rejects(read('scoringInputs',[randomId(),oldProgram,dataset._id,student.subject,statement.context[15],statement.context[16],true]));
  await assert.rejects(write(issuer,'verifyScoring',[id,newProgram,...args.slice(2)]));
  await write(exam,'revokeExamDataset',[dataset._id]);await assert.rejects(write(issuer,'issueRight',[randomId(),id2]));
  const zero=`0x${'0'.repeat(64)}` as Hex;assert.equal((await read('credential',[right]))[1],3);
  const nonAdmitted=randomId();await write(authority,'recordResult',[nonAdmitted,randomId(),randomId(),zero,2027,false]);await assert.rejects(write(authority,'confirmResult',[nonAdmitted]));
  // Real API integration: independent exam records, authenticated students,
  // private/non-admitted evidence and contract-gated issuance.
  const mongo=await MongoMemoryServer.create({binary:{downloadDir:'cache/mongodb'}});t.after(()=>mongo.stop());
  const connection=await connectStore(mongo.getUri(),'zk_api_test');t.after(()=>connection.close());
  const store=connection.store;
  const password='fictional-test-password',hashed=await passwordHash(password);
  for(const studentId of ['api-admitted','api-not-admitted'])await store.students.insertOne({_id:studentId,name:'Fictional applicant',passwordHash:hashed});
  await store.operators.insertOne({_id:'api-office',name:'Fictional officer',institutionId:'fairpass-demo',passwordHash:hashed});
  const config={REGISTRY_VERSION:2,ADMIN_API_TOKEN:'admin'.repeat(10),INTEGRATION_API_TOKEN:'integration'.repeat(4),ISSUER_API_TOKEN:'issuer'.repeat(7),CORS_ORIGIN:'http://localhost:5173',INSTITUTION_ID:'fairpass-demo'} as Config;
  const apiGas:Record<string,{transactions:number;gas:bigint}>={};
  const gateway:ChainGateway={info:{chainId:31337,contractAddress:registry,deploymentBlock:'0',protocolVersion:2},issuer,read,write:async(role,method,args)=>{const r=await write(role==='issuer'?issuer:authority,method,[...args]);const entry=apiGas[method]??={transactions:0,gas:0n};entry.transactions++;entry.gas+=r.gasUsed;return {chainId:31337,contractAddress:registry,transactionHash:r.transactionHash,blockNumber:String(r.blockNumber)};},events:async()=>({}),ready:async()=>{}};
  const app=createApp(config,store,gateway);t.after(()=>app.locals.closeScoring());
  const login=async(studentId:string)=>(await request(app).post('/v1/auth/login').send({studentId,password}).expect(200)).body.token as string;
  const officer=(await request(app).post('/v1/auth/institution/login').send({operatorId:'api-office',password}).expect(200)).body.token;
  const admittedToken=await login('api-admitted'),notAdmittedToken=await login('api-not-admitted');
  const rule={id:'zk-rule-v1',institutionId:'fairpass-demo',programId:'zk-api-engineering',programName:'Fictional Thai Engineering',faculty:'Engineering',academicYear:2027,round:'Round 3',capacity:1,version:1,method:'normalized-weighted-sum',components:[['tgat','TGAT',20],['math1','Mathematics 1',40],['physics','Physics',40]].map(([id,label,weight])=>({scoreId:id,label,source:'demo-exam-provider',sourceComponentId:id,maximum:100,transformation:'normalize-to-100',weightPercent:weight,minimumPercent:50})),requiredSubjects:['tgat','math1','physics'],qualifications:[],status:'draft',createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null};
  await request(app).post('/v1/office/rulebooks/publish').auth(officer,{type:'bearer'}).send({...rule,qualifications:[{field:'curriculum',equals:'Science–Mathematics'}]}).expect(400);
  const published=(await request(app).post('/v1/office/rulebooks/publish').auth(officer,{type:'bearer'}).send(rule).expect(201)).body;
  const apiProgram=published.programId as Hex;
  const scores=(values:number[])=>['tgat','math1','physics'].map((id,i)=>({id,subject:id,label:id,score:values[i],maximum:100,provenance:'simulated-exam-provider'}));
  const apiDataset=await prover.dataset({_id:randomId(),year:2027,round:3,version:2,expiresAt:Math.floor(Date.now()/1000)+86400},await Promise.all(['api-admitted','api-not-admitted'].map(async(studentId,i)=>({studentId,subject:await store.subject(studentId,2027,randomId()),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:i===0?[8123,7345,9067]:[4012,9123,8234]}))));
  await store.examDatasets.insertOne(apiDataset);await write(exam,'commitExamDataset',[apiDataset._id,BigInt(apiDataset.root),2027,3,2,apiDataset.expiresAt]);
  await request(app).post('/v1/office/simulations').auth(officer,{type:'bearer'}).send({runId:'zk-api-run',programIds:[apiProgram],applicants:[{id:'api-admitted',scores:scores([81.23,73.45,90.67]),preferences:[rule.programId],qualifications:{}},{id:'api-not-admitted',scores:scores([40.12,91.23,82.34]),preferences:[rule.programId],qualifications:{}}]}).expect(201);
  let admitted=(await request(app).get('/v1/me/wallet').auth(admittedToken,{type:'bearer'}).expect(200)).body.records[0];
  const unsuccessful=(await request(app).get('/v1/me/wallet').auth(notAdmittedToken,{type:'bearer'}).expect(200)).body.records[0];
  assert.equal(admitted.scoring[0].status,'not_verified');assert.equal(unsuccessful.report.outcome,'not_admitted');
  const docs=await Promise.all(['api-admitted','api-not-admitted'].map(studentId=>store.results.findOne({studentId})));

  await request(app).post(`/v1/me/results/${admitted.resultId}/confirm`).auth(admittedToken,{type:'bearer'}).send({}).expect(200);
  await request(app).post(`/v1/issuer/results/${admitted.resultId}/issue`).auth(officer,{type:'bearer'}).send({}).expect(409);
  await request(app).post(`/v1/me/results/${unsuccessful.resultId}/scoring`).auth(admittedToken,{type:'bearer'}).send({programId:apiProgram}).expect(404);
  if(process.env.FAIRPASS_ZK_BROWSER_TEST==='1'){
    const {chromium}=await import('playwright');const {default:express}=await import('express');const path=await import('node:path');
    const host=express();host.use('/api',app);host.use(express.static(path.resolve('../web/dist')));host.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('../web/dist/index.html')));
    const server=host.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
    const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
    const errors:string[]=[];
    for(const studentId of ['api-not-admitted','api-admitted']){
      const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/student/wallet');await page.getByLabel('Student ID',{exact:true}).fill(studentId);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
      await page.getByRole('region',{name:'Private score verification'}).getByText('Not yet verified',{exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Private score verification'}).getByText('ZK proof verified',{exact:true}).count(),0);
      await page.getByRole('button',{name:'Verify private scoring',exact:true}).click();await page.getByRole('region',{name:'Private score verification'}).getByText('ZK proof verified',{exact:true}).waitFor({timeout:30000});
      if(studentId==='api-not-admitted'){await page.getByRole('heading',{name:'Your result. Clearly explained.',exact:true}).waitFor();await page.getByRole('region',{name:'Private score verification'}).getByText('Requirements not met',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Request confirmation',exact:true}).count(),0);}
      await page.reload();await page.getByRole('region',{name:'Private score verification'}).getByText('ZK proof verified',{exact:true}).waitFor();
      fs.mkdirSync('cache',{recursive:true});await page.screenshot({path:`cache/zk-${studentId}.png`,fullPage:true});await page.close();
    }
    assert.deepEqual(errors,[]);console.log('ZK browser checks passed: real private proof actions, both outcomes, honest badges and persistent evidence.');
  }
  await request(app).post(`/v1/me/results/${admitted.resultId}/scoring`).auth(admittedToken,{type:'bearer'}).send({programId:apiProgram}).expect(200);
  await request(app).post(`/v1/office/results/${unsuccessful.resultId}/scoring`).auth(officer,{type:'bearer'}).send({programId:apiProgram}).expect(200);
  admitted=(await request(app).get('/v1/me/wallet').auth(admittedToken,{type:'bearer'}).expect(200)).body.records[0];
  assert.equal(admitted.scoring[0].status,'verified');assert.equal(admitted.scoring[0].eligible,true);
  const nonAdmittedWallet=(await request(app).get('/v1/me/wallet').auth(notAdmittedToken,{type:'bearer'}).expect(200)).body;
  assert.equal(nonAdmittedWallet.records[0].scoring[0].status,'verified');assert.equal(nonAdmittedWallet.records[0].scoring[0].eligible,false);assert.equal(nonAdmittedWallet.records[0].credential,null);
  assert.equal((await request(app).get(`/v1/me/results/${admitted.resultId}/proof`).auth(admittedToken,{type:'bearer'}).expect(200)).body.verification.scoreAuthenticity,'verified');
  const issued=(await request(app).post(`/v1/issuer/results/${admitted.resultId}/issue`).auth(officer,{type:'bearer'}).send({}).expect(200)).body;
  const publicRecord=(await request(app).get(`/v1/public/verify/${issued.credentialId}`).expect(200)).body;
  const publicJSON=JSON.stringify(publicRecord);
  for(const secret of ['api-admitted','api-not-admitted','scoreRecords','preferences',docs[0]!.salt])assert.ok(!publicJSON.includes(secret));
  const publicPrograms=(await request(app).get('/v1/public/programs').expect(200)).body;assert.ok(!JSON.stringify(publicPrograms).includes('api-admitted'));
  await store.results.updateOne({_id:docs[1]!._id},{$set:{'report.scoreRecords.0.score':99}});
  const tampered=(await request(app).get('/v1/me/wallet').auth(notAdmittedToken,{type:'bearer'}).expect(200)).body.records[0];assert.equal(tampered.scoring[0].status,'not_verified');
  await request(app).post(`/v1/me/results/${unsuccessful.resultId}/scoring`).auth(notAdmittedToken,{type:'bearer'}).send({programId:apiProgram}).expect(409);
  // Full Demo World on an isolated EVM/Mongo: 9 students, 3 programs, 27 real proofs.
  const beforeWorldGas=structuredClone(apiGas);
  const world=createDemoScenario('integration');
  for(const a of world.applicants)await store.students.insertOne({_id:a.id,name:'Fictional Demo World student',passwordHash:hashed});
  const worldPrograms:Hex[]=[];
  for(const rulebook of world.rulebooks)worldPrograms.push((await request(app).post('/v1/office/rulebooks/publish').auth(officer,{type:'bearer'}).send(rulebook).expect(201)).body.programId);
  const worldBody={runId:world.runId,programIds:worldPrograms,applicants:world.applicants.map(a=>({...a,scores:a.scores.map(s=>({...s,score:99}))}))};
  // The current dataset does not contain this cohort: no results can be allocated yet.
  await request(app).post('/v1/office/simulations').auth(officer,{type:'bearer'}).send(worldBody).expect(409);
  const worldDataset=await prover.dataset({_id:randomId(),year:2027,round:3,version:3,expiresAt:Math.floor(Date.now()/1000)+86400},await Promise.all(world.applicants.map(async a=>({studentId:a.id,subject:await store.subject(a.id,2027,randomId()),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:a.scores.map(s=>Math.round(s.score*100))}))));
  await store.examDatasets.insertOne(worldDataset);await write(exam,'commitExamDataset',[worldDataset._id,BigInt(worldDataset.root),2027,3,3,worldDataset.expiresAt],'demo_world_dataset');
  await store.examDatasets.updateOne({_id:worldDataset._id},{$set:{'records.0.scores.0':1}});
  await request(app).post('/v1/office/simulations').auth(officer,{type:'bearer'}).send(worldBody).expect(409);
  await store.examDatasets.updateOne({_id:worldDataset._id},{$set:{'records.0.scores.0':worldDataset.records[0].scores[0]}});
  const worldRun=(await request(app).post('/v1/office/simulations').auth(officer,{type:'bearer'}).send(worldBody).expect(201)).body;
  assert.deepEqual(worldRun.assignments,Object.fromEntries(world.expected.map(s=>[s.studentId,s.programId])));
  const persistedRun=await store.runs.findOne({_id:world.runId});assert.equal(persistedRun?.authenticatedInput?.datasetId,worldDataset._id);
  assert.equal(persistedRun?.applicants[0].scores[0].score,90); // submitted 99 was ignored
  let verifiedClaims=0,issuedRights=0;
  for(const expected of world.expected){
    const studentToken=await login(expected.studentId);
    const doc=await store.results.findOne({studentId:expected.studentId});assert.ok(doc);
    for(const programId of worldPrograms){
      const response:request.Response=await request(app).post(`/v1/me/results/${doc.resultId}/scoring`).auth(studentToken,{type:'bearer'}).send({programId}).expect(200);
      const index=worldPrograms.indexOf(programId);const calc=expected.calculations[index];
      assert.equal(response.body.status,'verified');assert.equal(response.body.calculatedScore,calc.status==='calculated'?calc.total:null);verifiedClaims++;
    }
    if(expected.programId){
      await request(app).post(`/v1/me/results/${doc.resultId}/confirm`).auth(studentToken,{type:'bearer'}).send({}).expect(200);
      const issued=await request(app).post(`/v1/issuer/results/${doc.resultId}/issue`).auth(officer,{type:'bearer'}).send({}).expect(200);
      await request(app).get(`/v1/public/verify/${issued.body.credentialId}`).expect(200);issuedRights++;
    }else{
      await request(app).post(`/v1/me/results/${doc.resultId}/confirm`).auth(studentToken,{type:'bearer'}).send({}).expect(409);
      assert.equal((await read('credential',[doc.credentialId]))[1],0);
    }
  }
  assert.equal(verifiedClaims,27);assert.equal(issuedRights,6);
  for(const programId of worldPrograms)assert.equal((await read('programs',[programId]))[3],2);
  // The public replay reconciles actual code/receipts and never receives signer capabilities.
  const logs=await client.getContractEvents({address:registry,abi,fromBlock:0n,toBlock:await client.getBlockNumber({cacheTime:0})});
  const kinds:Record<string,string>={ProgramRegistered:'program',ScoringPolicyRegistered:'program',RulesLocked:'program',ExamDatasetCommitted:'dataset',ScoringVerified:'scoring',ResultRecorded:'result',ConfirmationRecorded:'confirmation',RightIssued:'credential'};
  const evidence=logs.filter(l=>!!kinds[l.eventName!]).map(log=>{const args=log.args as any;const kind=kinds[log.eventName!];return {kind,reference:log.eventName==='ScoringVerified'?args.resultId:kind==='credential'?args.credentialId:args.program??args.dataset??args.resultId,eventName:log.eventName,logIndex:log.logIndex,...(kind==='scoring'?{programId:args.program}:{}),receipt:{chainId:31337,contractAddress:registry,transactionHash:log.transactionHash,blockNumber:String(log.blockNumber)}};});
  const bindings=[];for(const student of world.expected){const doc=await store.results.findOne({studentId:student.studentId});bindings.push({id:student.studentId,resultId:doc!.resultId,credentialId:doc!.credentialId});}
  const manifest=evidenceManifestSchema.parse({schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId:'integration',chainId:31337,registry,verifier,verificationKeySha256:createHash('sha256').update(fs.readFileSync('../zk/scoring/target/vk')).digest('hex'),deploymentBlock:'0',recordedAt:new Date().toISOString(),roles:{admin,authority,issuer,exam},deployments,evidence,bindings:{datasetId:worldDataset._id,programIds:worldPrograms,students:bindings},security:{deployment:deployments[3],programId:program,ineligible:{resultId:id3,credentialId:randomId(),blockNumber:eligibilityBlock,expectedError:'ProofRequired'},eligible:{resultId:id2,credentialId:randomId(),blockNumber:capacityBlock,expectedError:'Capacity'}}});
  const manifestPath=`cache/demo-world-${randomId()}.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest));t.after(()=>fs.rmSync(manifestPath,{force:true}));
  const replayConfig={...config,DEMO_READ_ONLY:true,DEMO_WORLD_INSTANCE:'integration',DEMO_REPLAY_MANIFEST:manifestPath,RPC_URL:chain.rpcUrls.default.http[0]} as Config;
  const publicApp=createApp(replayConfig,store,gateway);t.after(()=>publicApp.locals.closeScoring());
  const replay=(await request(publicApp).get('/v1/demo/world').expect(200)).body;
  assert.equal(replay.state,'verified');assert.equal(replay.mode,'local');assert.equal(replay.students.length,9);
  const replayJSON=JSON.stringify(replay);for(const privateField of ['totalSalt','record_salt','siblings','passwordHash','witnessInput'])assert.ok(!replayJSON.includes(privateField));
  for(const student of replay.students)assert.equal(student.proof.salt,undefined);
  const nonce=await client.getTransactionCount({address:issuer,blockTag:'pending'});
  const changed=(await request(publicApp).get('/v1/demo/world/experiments/score?score=89.25').expect(200)).body;assert.equal(changed.outcome,'rejected');assert.equal(changed.submittedTransaction,false);
  const originalResponse=await request(publicApp).get('/v1/demo/world/experiments/score?score=88.25');assert.equal(originalResponse.status,200,JSON.stringify(originalResponse.body));assert.equal(originalResponse.body.outcome,'accepted');
  for(const kind of ['eligibility','capacity'])assert.equal((await request(publicApp).get('/v1/demo/world/experiments/'+kind).expect(200)).body.outcome,'rejected');
  await request(publicApp).post('/v1/office/simulations').send({}).expect(403);assert.equal(await client.getTransactionCount({address:issuer,blockTag:'pending'}),nonce);
  const checker=new DemoWorldService(replayConfig,store,gateway,new ScoringService(store,gateway));t.after(()=>checker.close());
  await assert.rejects(checker.reconcile({...manifest,verificationKeySha256:'0'.repeat(64)}));
  await assert.rejects(checker.reconcile({...manifest,deployments:manifest.deployments!.map((d,i)=>i===0?{...d,runtimeCodeHash:randomId()}:d)}));
  await assert.rejects(checker.reconcile({...manifest,evidence:manifest.evidence.map((e,i)=>i===0?{...e,logIndex:9999}:e)}));
  const offline=new DemoWorldService({...replayConfig,RPC_URL:'http://127.0.0.1:9'},store,gateway,new ScoringService(store,gateway));t.after(()=>offline.close());assert.equal((await offline.snapshot()).state,'unavailable');
  await write(exam,'revokeExamDataset',[worldDataset._id]);
  const stale=new DemoWorldService(replayConfig,store,gateway,new ScoringService(store,gateway));t.after(()=>stale.close());assert.equal((await stale.snapshot()).state,'stale');
  metrics.demoWorldGas=Object.fromEntries(Object.entries(apiGas).map(([method,value])=>[method,{transactions:value.transactions-(beforeWorldGas[method]?.transactions??0),gas:String(value.gas-(beforeWorldGas[method]?.gas??0n))}]));
  metrics.demoWorld={students:9,programs:3,realVerifiedClaims:verifiedClaims,issuedRights,externalTransactionsSubmitted:0};
  fs.mkdirSync('artifacts/zk',{recursive:true});fs.writeFileSync('artifacts/zk/measurements.json',JSON.stringify(metrics,null,2));
  console.log('ZK measurements',JSON.stringify(metrics));
});
