/** Local-only real scenario orchestration. Never loads or uses prepared Fuji keys. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,createWalletClient,defineChain,http,keccak256,decodeEventLog,type Hex,type Abi} from 'viem';
import {readConfig} from '../src/config.js';
import {connectStore} from '../src/store.js';
import {createDemoScenario,definitionDigest,DEFINITION_ID} from '../src/demo/scenario.js';
import {evidenceManifestSchema} from '../src/demo/replay.js';
import {ScoringProver} from '../src/zk/prover.js';
import {freshField,policyFromRule,versionedProgramId,scoringPolicyHash} from '../src/zk/encoding.js';
import {randomId,rulesCommitment,commitment} from '../src/crypto.js';
import {rulebookCommitment} from '../shared/domain.js';
const c=readConfig();
if(process.env.FAIRPASS_LOCAL!=='true'||c.CHAIN_ID!==31337||c.REGISTRY_VERSION!==2||!c.DEMO_WORLD_INSTANCE)throw Error('Only a dedicated local Demo World may be prepared');
const file=process.env.DEMO_REPLAY_MANIFEST??'/app/deployments/demo-world.json';
if(fs.existsSync(file))throw Error('Demo World already has a manifest. Preserve its history; use replay or explicitly prepare a separate environment.');
const world=createDemoScenario(c.DEMO_WORLD_INSTANCE);
const local=defineChain({id:31337,name:'Demo World local EVM',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[c.RPC_URL]}}});
const client=createPublicClient({chain:local,transport:http(c.RPC_URL)});if(await client.getChainId()!==31337)throw Error('Local chain required');
const wallet=createWalletClient({chain:local,transport:http(c.RPC_URL)});const [admin,authority,issuer,exam]=await wallet.getAddresses();
const a=JSON.parse(fs.readFileSync('artifacts/FairPassRegistryV2.json','utf8'));const abi=a.abi as Abi;
const base=process.env.API_URL??'http://presenter:3001';
async function api(path:string,body:unknown,token?:string){const r=await fetch(base+'/v1'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return await r.json() as any;}
async function write(address:Hex,account:Hex,functionName:string,args:any[]){const {request}=await client.simulateContract({address,abi,functionName,args,account});const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Local preparation reverted');return {chainId:31337,contractAddress:address,transactionHash:hash,blockNumber:String(receipt.blockNumber)};}
const connection=await connectStore(c.MONGODB_URI,c.MONGODB_DATABASE);const {store}=connection;const prover=await ScoringProver.create();
try{
 const password=process.env.DEMO_PASSWORD!;
 for(const expected of world.expected){if(!await store.students.findOne({_id:expected.studentId}))await api('/admin/students',{studentId:expected.studentId,name:expected.name,password},c.ADMIN_API_TOKEN);}
 const office=(await api('/auth/institution/login',{operatorId:'demo-office',password})).token;
 let dataset=await store.examDatasets.findOne({year:2027,round:3,version:1});
 if(!dataset){dataset=await prover.dataset({_id:randomId(),year:2027,round:3,version:1,expiresAt:Math.floor(Date.now()/1000)+365*86400},await Promise.all(world.applicants.map(async student=>({studentId:student.id,subject:await store.subject(student.id,2027,randomId()),recordVersion:1,salt:freshField(),subjects:[1,7,8],scores:student.scores.map(s=>Math.round(s.score*100))}))));await store.examDatasets.insertOne(dataset);}
 const existing=await client.readContract({address:c.CONTRACT_ADDRESS as Hex,abi,functionName:'datasets',args:[dataset._id]}) as any;
 if(!existing[0]){const publication=await write(c.CONTRACT_ADDRESS as Hex,exam,'commitExamDataset',[dataset._id,BigInt(dataset.root),2027,3,1,dataset.expiresAt]);await store.examDatasets.updateOne({_id:dataset._id},{$set:{publication}});}
 const programIds:Hex[]=[];
 for(const rule of world.rulebooks)programIds.push((await api('/office/rulebooks/publish',rule,office)).programId);
 await api('/office/simulations',{runId:world.runId,programIds,applicants:world.applicants},office);
 const students=[];
 for(const expected of world.expected){
  const doc=await store.results.findOne({studentId:expected.studentId,'report.runId':world.runId});if(!doc)throw Error('Result missing');
  for(const programId of programIds)await api(`/office/results/${doc.resultId}/scoring`,{programId},office);
  if(expected.programId){const token=(await api('/auth/login',{studentId:expected.studentId,password})).token;await api(`/me/results/${doc.resultId}/confirm`,{},token);await api(`/issuer/results/${doc.resultId}/issue`,{},office);}
  students.push({id:expected.studentId,resultId:doc.resultId,credentialId:doc.credentialId});
 }
 // An isolated registry makes guard checks independent of the replay's seats/root.
 const verifier=await client.readContract({address:c.CONTRACT_ADDRESS as Hex,abi,functionName:'scoringVerifier'}) as Hex;
 const hash=await wallet.deployContract({account:admin,abi,bytecode:a.bytecode,args:[admin,authority,exam,verifier]});const deployed=await client.waitForTransactionReceipt({hash});if(!deployed.contractAddress)throw Error('Security registry missing');const securityAddress=deployed.contractAddress;
 await write(securityAddress,admin,'authorizeInstitution',[issuer,true]);
 const sr={...world.rulebooks[0],id:'security-ce-v1',programId:'security-ce'};const intake=rulesCommitment({scheme:'demo-world-security-v1',instance:world.instanceId});const policy=policyFromRule(sr,intake),securityProgram=versionedProgramId(policy);const rulesHash=scoringPolicyHash(2027,2,policy);
 await write(securityAddress,issuer,'registerScoringProgram',[securityProgram,2027,2,await rulebookCommitment(sr),policy]);await write(securityAddress,issuer,'lockRules',[securityProgram]);await write(securityAddress,exam,'commitExamDataset',[dataset._id,BigInt(dataset.root),2027,3,1,dataset.expiresAt]);
 const fixtures:Record<string,{resultId:Hex;credentialId:Hex}>={};
 for(const name of ['Dao','Narin','Arun','Pim']){
  const student=world.expected.find(s=>s.name===name)!;const record=dataset.records.find(r=>r.studentId===student.studentId)!;const resultId=randomId(),credentialId=randomId();
  const statement=await prover.statement(dataset,record,policy,{chainId:31337,registry:securityAddress,program:securityProgram,rulesHash,resultId});const proof=await prover.prove(statement);
  await write(securityAddress,authority,'recordResult',[resultId,commitment({securityTest:true,name},randomId()),record.subject,securityProgram,2027,true]);
  await write(securityAddress,issuer,'verifyScoring',[resultId,securityProgram,dataset._id,record.subject,statement.context[15],statement.context[16],statement.calculated.eligible,proof.proof]);
  await write(securityAddress,authority,'confirmResult',[resultId]);fixtures[name]={resultId,credentialId};
 }
 const eligibilityBlock=String(await client.getBlockNumber({cacheTime:0}));
 for(const name of ['Arun','Pim'])await write(securityAddress,issuer,'issueRight',[fixtures[name].credentialId,fixtures[name].resultId]);
 const capacityBlock=String(await client.getBlockNumber({cacheTime:0}));
 const progress=JSON.parse(fs.readFileSync('/app/deployments/zk-31337-progress.json','utf8'));
 const deploymentRecord=async(name:string,address:Hex,transactionHash:Hex,blockNumber:string)=>({name,address,transactionHash,blockNumber,runtimeCodeHash:keccak256((await client.getCode({address}))!)});
 const deployments=await Promise.all(progress.deployments.map((d:any)=>deploymentRecord(d.name,d.address,d.transactionHash,d.block)));
 const evidence:any[]=[];
 const eventKinds:Record<string,string>={ProgramRegistered:'program',RulesLocked:'program',ScoringPolicyRegistered:'program',ExamDatasetCommitted:'dataset',ScoringVerified:'scoring',ResultRecorded:'result',ConfirmationRecorded:'confirmation',RightIssued:'credential'};
 const logs=await client.getContractEvents({address:c.CONTRACT_ADDRESS as Hex,abi,fromBlock:c.DEPLOYMENT_BLOCK,toBlock:await client.getBlockNumber({cacheTime:0})});
 for(const log of logs){const kind=eventKinds[log.eventName!];if(!kind)continue;const args=log.args as any;const reference=log.eventName==='ScoringVerified'?args.resultId:kind==='credential'?args.credentialId:args.program??args.dataset??args.resultId;if(!reference)continue;evidence.push({kind,reference,eventName:log.eventName,logIndex:log.logIndex,...(log.eventName==='ScoringVerified'?{programId:args.program}:{}),receipt:{chainId:31337,contractAddress:c.CONTRACT_ADDRESS,transactionHash:log.transactionHash,blockNumber:String(log.blockNumber)}});}
 const manifest=evidenceManifestSchema.parse({schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId:world.instanceId,chainId:31337,registry:c.CONTRACT_ADDRESS,verifier,verificationKeySha256:createHash('sha256').update(fs.readFileSync('../zk/scoring/target/vk')).digest('hex'),deploymentBlock:String(c.DEPLOYMENT_BLOCK),recordedAt:new Date().toISOString(),roles:{admin,authority,issuer,exam},deployments,evidence,bindings:{datasetId:dataset._id,programIds,students},security:{deployment:await deploymentRecord('FairPassRegistryV2',securityAddress,hash,String(deployed.blockNumber)),programId:securityProgram,ineligible:{...fixtures.Dao,blockNumber:eligibilityBlock,expectedError:'ProofRequired'},eligible:{...fixtures.Narin,blockNumber:capacityBlock,expectedError:'Capacity'}}});
 fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log('Demo World prepared locally: nine students, 27 scoring proofs, six rights; four additional isolated security proofs. No Fuji transactions.');
}finally{await prover.close();await connection.close();}
