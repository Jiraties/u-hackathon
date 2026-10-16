/** Explicitly approved Fuji preparation. Keys stay in local custody; no public API is opened. */
import fs from 'node:fs';
import {parse} from 'dotenv';
import {privateKeyToAccount} from 'viem/accounts';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app.js';
import {createChain} from '../src/chain.js';
import {createHash} from 'node:crypto';
import {createPublicClient,createWalletClient,defineChain,http,keccak256,encodeDeployData,decodeEventLog,type Hex,type Abi} from 'viem';
import {readConfig} from '../src/config.js';
import {connectStore} from '../src/store.js';
import {createDemoScenario,definitionDigest,DEFINITION_ID} from '../src/demo/scenario.js';
import {evidenceManifestSchema} from '../src/demo/replay.js';
import {ScoringProver} from '../src/zk/prover.js';
import {freshField,policyFromRule,versionedProgramId,scoringPolicyHash} from '../src/zk/encoding.js';
import {randomId,rulesCommitment,commitment} from '../src/crypto.js';
import {rulebookCommitment} from '../shared/domain.js';
const c=readConfig();
if(process.env.CONFIRM_FUJI_DEMO!=='true'||process.env.FAIRPASS_LOCAL==='true'||c.CHAIN_ID!==43113||c.REGISTRY_VERSION!==2||c.DEMO_WORLD_INSTANCE!=='fuji-replay-001'||c.MONGODB_DATABASE!=='fairpass_demo_world_v2_fuji_001'||c.CONTRACT_ADDRESS.toLowerCase()!=='0x7b312c07b93c420d1c371dccd88fe5a36b4c093b')throw Error('Only the approved isolated Fuji V2 scenario may be prepared');
const file=process.env.DEMO_REPLAY_MANIFEST??'/app/deployments/demo-world-fuji.json';
if(fs.existsSync(file))throw Error('Demo World already has a manifest. Preserve its history; use replay or explicitly prepare a separate environment.');
const world=createDemoScenario(c.DEMO_WORLD_INSTANCE);
const local=defineChain({id:43113,name:'Avalanche Fuji',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[c.RPC_URL]}}});
const client=createPublicClient({chain:local,transport:http(c.RPC_URL)});if(await client.getChainId()!==43113)throw Error('Fuji required');
const wallet=createWalletClient({chain:local,transport:http(c.RPC_URL)});
const signers=[privateKeyToAccount(parse(fs.readFileSync('/run/secrets/admin.env')).PRIVATE_KEY as Hex),privateKeyToAccount(c.AUTHORITY_PRIVATE_KEY! as Hex),privateKeyToAccount(c.ISSUER_PRIVATE_KEY! as Hex),privateKeyToAccount(parse(fs.readFileSync('/run/secrets/examinationAuthority.env')).PRIVATE_KEY as Hex)];
const [admin,authority,issuer,exam]=signers.map(a=>a.address);
const accountFor=(address:Hex)=>signers.find(a=>a.address.toLowerCase()===address.toLowerCase())!;
const fees={maxFeePerGas:c.MAX_FEE_PER_GAS_WEI??1000000n,maxPriorityFeePerGas:160n};
const a=JSON.parse(fs.readFileSync('artifacts/FairPassRegistryV2.json','utf8'));const abi=a.abi as Abi;
const logClient=createPublicClient({transport:http('https://avalanche-fuji-c-chain-rpc.publicnode.com')});
async function contractLogs(address:Hex){if(await logClient.getChainId()!==43113)throw Error('Wrong evidence network');const output:any[]=[];const latest=await client.getBlockNumber({cacheTime:0});for(let from=c.DEPLOYMENT_BLOCK;from<=latest;from+=2000n)output.push(...(await logClient.getLogs({address,fromBlock:from,toBlock:from+1999n<latest?from+1999n:latest})).map(l=>({...l,...decodeEventLog({abi,data:l.data,topics:l.topics})})));return output;}
let base='';
async function api(path:string,body:unknown,token?:string){const r=await fetch(base+'/v1'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return await r.json() as any;}
const nextNonce=new Map<string,number>();
async function write(address:Hex,account:Hex,functionName:string,args:any[]){const nonce=Math.max(await client.getTransactionCount({address:account,blockTag:'pending'}),nextNonce.get(account)??0);const {request}=await client.simulateContract({address,abi,functionName,args,account:accountFor(account),nonce,...fees});const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Fuji preparation reverted');nextNonce.set(account,nonce+1);return {chainId:43113,contractAddress:address,transactionHash:hash,blockNumber:String(receipt.blockNumber)};}
const connection=await connectStore(c.MONGODB_URI,c.MONGODB_DATABASE);const {store}=connection;const prover=await ScoringProver.create();
const gateway=createChain(c);await gateway.ready();const app=createApp(c,store,gateway);const server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try{
 const password=process.env.DEMO_PASSWORD!;
 if(!await store.operators.findOne({_id:'demo-office',institutionId:c.INSTITUTION_ID}))await api('/admin/operators',{operatorId:'demo-office',name:'Authorized Fuji presenter',institutionId:c.INSTITUTION_ID,password},c.ADMIN_API_TOKEN);
 for(const expected of world.expected){if(!await store.students.findOne({_id:expected.studentId}))await api('/admin/students',{studentId:expected.studentId,name:expected.name,password},c.ADMIN_API_TOKEN);}
 const office=(await api('/auth/institution/login',{operatorId:'demo-office',password})).token;
 let dataset=await store.examDatasets.findOne({year:2027,round:3,version:1});
 if(!dataset){dataset=await prover.dataset({_id:randomId(),year:2027,round:3,version:1,expiresAt:Math.floor(Date.now()/1000)+365*86400},await Promise.all(world.applicants.map(async student=>({studentId:student.id,subject:await store.subject(student.id,2027,randomId()),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:student.scores.map(s=>Math.round(s.score*100))}))));await store.examDatasets.insertOne(dataset);}
 const existing=await client.readContract({address:c.CONTRACT_ADDRESS as Hex,abi,functionName:'datasets',args:[dataset._id]}) as any;
 if(!existing[0]){const publication=await write(c.CONTRACT_ADDRESS as Hex,exam,'commitExamDataset',[dataset._id,BigInt(dataset.root),2027,3,1,dataset.expiresAt]);await store.examDatasets.updateOne({_id:dataset._id},{$set:{publication}});}
 console.log('Authenticated examination dataset committed.');
 const programIds:Hex[]=[];
 if(process.env.RESUME_GUARDS_ONLY==='true'){const run=await store.runs.findOne({_id:world.runId});if(!run?.completedAt||run.programIds?.length!==3)throw Error('Completed main scenario required');programIds.push(...run.programIds);}else{for(const rule of world.rulebooks)programIds.push((await api('/office/rulebooks/publish',rule,office)).programId);await api('/office/simulations',{runId:world.runId,programIds,applicants:world.applicants},office);}
 console.log('Three rulebooks locked and allocation results recorded.');
 const students=[];
 for(const expected of world.expected){
  const doc=await store.results.findOne({studentId:expected.studentId,'report.runId':world.runId});if(!doc)throw Error('Result missing');
  if(process.env.RESUME_GUARDS_ONLY==='true'){if(programIds.some(id=>!doc.scoring?.[id]?.verification)||!!doc.issuance!==!!expected.programId)throw Error('Main scenario evidence incomplete');}else for(const programId of programIds)await api(`/office/results/${doc.resultId}/scoring`,{programId},office);
  if(expected.programId&&process.env.RESUME_GUARDS_ONLY!=='true'){const token=(await api('/auth/login',{studentId:expected.studentId,password})).token;await api(`/me/results/${doc.resultId}/confirm`,{},token);await api(`/issuer/results/${doc.resultId}/issue`,{},office);}
  students.push({id:expected.studentId,resultId:doc.resultId,credentialId:doc.credentialId});console.log(expected.name+': three real scoring proofs verified'+(expected.programId?', right issued':', result without a right'));
 }
 // An isolated registry makes guard checks independent of the replay's seats/root.
 const verifier=await client.readContract({address:c.CONTRACT_ADDRESS as Hex,abi,functionName:'scoringVerifier'}) as Hex;
 const guardFile=process.env.GUARD_PROGRESS_PATH??file+'.guard-progress';
 let guard:any=fs.existsSync(guardFile)?JSON.parse(fs.readFileSync(guardFile,'utf8')):null;
 const saveGuard=()=>fs.writeFileSync(guardFile,JSON.stringify(guard,null,2),{mode:0o600});
 const resume=process.env.SECURITY_RESUME_ADDRESS as Hex|undefined;
 if(!guard&&resume){
   if(resume.toLowerCase()!=='0x6313868bb45ed233848cb4047fdd348fe4d1dbca')throw Error('Unexpected guard recovery address');
   const logs=await contractLogs(resume);
   const creation=logs.find(l=>l.eventName==='RoleGranted');if(!creation)throw Error('Guard creation missing');
   const tx=await client.getTransaction({hash:creation.transactionHash});const r=await client.getTransactionReceipt({hash:creation.transactionHash});
   if(tx.from.toLowerCase()!==admin.toLowerCase()||r.contractAddress?.toLowerCase()!==resume.toLowerCase()||tx.input!==encodeDeployData({abi,bytecode:a.bytecode,args:[admin,authority,exam,verifier]}))throw Error('Recovered guard deployment mismatch');
   guard={address:resume,hash:tx.hash,block:String(r.blockNumber),fixtures:{}};saveGuard();
 }
 if(!guard){const hash=await wallet.deployContract({account:accountFor(admin),abi,bytecode:a.bytecode,args:[admin,authority,exam,verifier],...fees});const deployed=await client.waitForTransactionReceipt({hash});if(!deployed.contractAddress)throw Error('Security registry missing');guard={address:deployed.contractAddress,hash,block:String(deployed.blockNumber),fixtures:{}};saveGuard();}
 const securityAddress=guard.address as Hex,hash=guard.hash as Hex;
 const deployed={blockNumber:BigInt(guard.block)};
 const readGuard=(functionName:string,args:any[]=[])=>client.readContract({address:securityAddress,abi,functionName,args}) as Promise<any>;
 if(!await readGuard('institutions',[issuer]))await write(securityAddress,admin,'authorizeInstitution',[issuer,true]);
 const sr={...world.rulebooks[0],id:'security-ce-v1',programId:'security-ce'};const intake=rulesCommitment({scheme:'demo-world-security-v1',instance:world.instanceId});const policy=policyFromRule(sr,intake),securityProgram=versionedProgramId(policy);const rulesHash=scoringPolicyHash(2027,2,policy);
 if(!(await readGuard('programs',[securityProgram]))[1])await write(securityAddress,issuer,'registerScoringProgram',[securityProgram,2027,2,await rulebookCommitment(sr),policy]);if(!(await readGuard('programs',[securityProgram]))[7])await write(securityAddress,issuer,'lockRules',[securityProgram]);if(!(await readGuard('datasets',[dataset._id]))[0])await write(securityAddress,exam,'commitExamDataset',[dataset._id,BigInt(dataset.root),2027,3,1,dataset.expiresAt]);
 const fixtures:Record<string,{resultId:Hex;credentialId:Hex}>={};
 for(const name of ['Dao','Narin','Arun','Pim']){
  const student=world.expected.find(s=>s.name===name)!;const record=dataset.records.find(r=>r.studentId===student.studentId)!;const fixture=guard.fixtures[name]??={resultId:randomId(),credentialId:randomId(),totalSalt:freshField()};saveGuard();const {resultId,credentialId}=fixture;
  const statement=await prover.statement(dataset,record,policy,{chainId:43113,registry:securityAddress,program:securityProgram,rulesHash,resultId},fixture.totalSalt);
  if(!(await readGuard('resultCommitment',[resultId]))[1])await write(securityAddress,authority,'recordResult',[resultId,commitment({securityTest:true,name},randomId()),record.subject,securityProgram,2027,true]);
  if(!(await readGuard('scoreClaims',[resultId,securityProgram]))[6]){const proof=await prover.prove(statement);await write(securityAddress,issuer,'verifyScoring',[resultId,securityProgram,dataset._id,record.subject,statement.context[15],statement.context[16],statement.calculated.eligible,proof.proof]);}
  if(!await readGuard('isConfirmed',[resultId]))await write(securityAddress,authority,'confirmResult',[resultId]);fixtures[name]={resultId,credentialId};
 }
 const eligibilityBlock=guard.eligibilityBlock??=String(await client.getBlockNumber({cacheTime:0}));saveGuard();
 for(const name of ['Arun','Pim'])if(!(await readGuard('credential',[fixtures[name].credentialId]))[1])await write(securityAddress,issuer,'issueRight',[fixtures[name].credentialId,fixtures[name].resultId]);

 // Keep the ineligible fixture's capacity unoccupied so current-state RPC calls
 // reach the scoring gate rather than the earlier capacity gate.
 const eligibilityRule={...world.rulebooks[0],id:'security-eligibility-ce-v1',programId:'security-eligibility-ce'};
 const eligibilityPolicy=policyFromRule(eligibilityRule,rulesCommitment({scheme:'demo-world-eligibility-v1',instance:world.instanceId}));
 const eligibilityProgram=versionedProgramId(eligibilityPolicy),eligibilityRulesHash=scoringPolicyHash(2027,2,eligibilityPolicy);
 if(!(await readGuard('programs',[eligibilityProgram]))[1])await write(securityAddress,issuer,'registerScoringProgram',[eligibilityProgram,2027,2,await rulebookCommitment(eligibilityRule),eligibilityPolicy]);
 if(!(await readGuard('programs',[eligibilityProgram]))[7])await write(securityAddress,issuer,'lockRules',[eligibilityProgram]);
 guard.eligibilityFixture??={resultId:randomId(),credentialId:randomId(),totalSalt:freshField()};saveGuard();
 const eligibilityFixture=guard.eligibilityFixture,dao=world.expected.find(s=>s.name==='Dao')!,daoRecord=dataset.records.find(r=>r.studentId===dao.studentId)!;
 if(!(await readGuard('resultCommitment',[eligibilityFixture.resultId]))[1])await write(securityAddress,authority,'recordResult',[eligibilityFixture.resultId,commitment({securityTest:true,name:'Dao eligibility'},randomId()),daoRecord.subject,eligibilityProgram,2027,true]);
 if(!(await readGuard('scoreClaims',[eligibilityFixture.resultId,eligibilityProgram]))[6]){
  const statement=await prover.statement(dataset,daoRecord,eligibilityPolicy,{chainId:43113,registry:securityAddress,program:eligibilityProgram,rulesHash:eligibilityRulesHash,resultId:eligibilityFixture.resultId},eligibilityFixture.totalSalt);const proof=await prover.prove(statement);
  await write(securityAddress,issuer,'verifyScoring',[eligibilityFixture.resultId,eligibilityProgram,dataset._id,daoRecord.subject,statement.context[15],statement.context[16],statement.calculated.eligible,proof.proof]);
 }
 if(!await readGuard('isConfirmed',[eligibilityFixture.resultId]))await write(securityAddress,authority,'confirmResult',[eligibilityFixture.resultId]);
 const capacityBlock=String(await client.getBlockNumber({cacheTime:0}));
 const progress=JSON.parse(fs.readFileSync('/app/deployments/zk-43113-progress.json','utf8'));
 const deploymentRecord=async(name:string,address:Hex,transactionHash:Hex,blockNumber:string)=>({name,address,transactionHash,blockNumber,runtimeCodeHash:keccak256((await client.getCode({address}))!)});
 const deployments=await Promise.all(progress.deployments.map((d:any)=>deploymentRecord(d.name,d.address,d.transactionHash,d.block)));
 const evidence:any[]=[];
 const eventKinds:Record<string,string>={ProgramRegistered:'program',RulesLocked:'program',ScoringPolicyRegistered:'program',ExamDatasetCommitted:'dataset',ScoringVerified:'scoring',ResultRecorded:'result',ConfirmationRecorded:'confirmation',RightIssued:'credential'};
 const logs=await contractLogs(c.CONTRACT_ADDRESS as Hex);
 for(const log of logs){const kind=eventKinds[log.eventName!];if(!kind)continue;const args=log.args as any;const reference=log.eventName==='ScoringVerified'?args.resultId:kind==='credential'?args.credentialId:args.program??args.dataset??args.resultId;if(!reference)continue;evidence.push({kind,reference,eventName:log.eventName,logIndex:log.logIndex,...(log.eventName==='ScoringVerified'?{programId:args.program}:{}),receipt:{chainId:43113,contractAddress:c.CONTRACT_ADDRESS,transactionHash:log.transactionHash,blockNumber:String(log.blockNumber)}});}
 const manifest=evidenceManifestSchema.parse({schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId:world.instanceId,chainId:43113,registry:c.CONTRACT_ADDRESS,verifier,verificationKeySha256:createHash('sha256').update(fs.readFileSync('../zk/scoring/target/vk')).digest('hex'),deploymentBlock:String(c.DEPLOYMENT_BLOCK),recordedAt:new Date().toISOString(),roles:{admin,authority,issuer,exam},deployments,evidence,bindings:{datasetId:dataset._id,programIds,students},security:{callMode:'current',deployment:await deploymentRecord('FairPassRegistryV2',securityAddress,hash,String(deployed.blockNumber)),programId:securityProgram,ineligible:{resultId:eligibilityFixture.resultId,credentialId:eligibilityFixture.credentialId,programId:eligibilityProgram,blockNumber:eligibilityBlock,expectedError:'ProofRequired'},eligible:{...fixtures.Narin,blockNumber:capacityBlock,expectedError:'Capacity'}}});
 fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log('Fuji Demo World prepared: nine students, 27 verified scoring claims, six main rights, five isolated guard proofs.');
}finally{server.close();await app.locals.closeScoring();await prover.close();await connection.close();}
