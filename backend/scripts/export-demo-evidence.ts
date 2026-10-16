/** Read-only collector for an already prepared local/Fuji scenario. Never signs. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,http,keccak256,type Hex,type Abi} from 'viem';
import {readConfig} from '../src/config.js';
import {connectStore} from '../src/store.js';
import {createChain} from '../src/chain.js';
import {ScoringService} from '../src/zk/service.js';
import {DemoWorldService} from '../src/demo/world.js';
import {createDemoScenario,definitionDigest,DEFINITION_ID} from '../src/demo/scenario.js';
import {evidenceManifestSchema} from '../src/demo/replay.js';
const c=readConfig();if(!c.DEMO_READ_ONLY||!c.DEMO_WORLD_INSTANCE)throw Error('Use keyless DEMO_READ_ONLY=true and an explicit scenario instance');
const [deploymentFile,out]=process.argv.slice(2);if(!deploymentFile||!out||fs.existsSync(out))throw Error('Provide actual deployment JSON and a new output path; historical manifests are never overwritten');
const source=JSON.parse(fs.readFileSync(deploymentFile,'utf8'));
const roles={admin:source.admin,authority:source.allocationAuthority,issuer:source.issuer,exam:source.examinationAuthority};
const client=createPublicClient({transport:http(c.RPC_URL)});if(await client.getChainId()!==c.CHAIN_ID)throw Error('Wrong chain');
const abi=JSON.parse(fs.readFileSync('artifacts/FairPassRegistryV2.json','utf8')).abi as Abi;
const connection=await connectStore(c.MONGODB_URI,c.MONGODB_DATABASE);const chain=createChain(c),scoring=new ScoringService(connection.store,chain);let service:DemoWorldService|undefined;
const temp=out+'.pending';if(fs.existsSync(temp))throw Error('Inspect the previous pending export before retrying');
try{
 await chain.ready();const scenario=createDemoScenario(c.DEMO_WORLD_INSTANCE);const run=await connection.store.runs.findOne({_id:scenario.runId});
 if(!run?.authenticatedInput||run.programIds?.length!==3)throw Error('A completed authenticated three-program run is required');
 const students=[];for(const expected of scenario.expected){const doc=await connection.store.results.findOne({studentId:expected.studentId,'report.runId':scenario.runId});if(!doc)throw Error('Scenario result missing');students.push({id:expected.studentId,resultId:doc.resultId,credentialId:doc.credentialId});}
 const deployments=[];for(const d of source.deployments??[]){const code=await client.getCode({address:d.address});if(!code)throw Error('Deployment code missing');deployments.push({name:d.name,address:d.address,transactionHash:d.transactionHash,blockNumber:String(d.block??d.blockNumber),runtimeCodeHash:keccak256(code)});}
 const accepted=new Set([...run.programIds,run.authenticatedInput.datasetId,...students.flatMap(s=>[s.resultId,s.credentialId])]);
 const kinds:Record<string,string>={ProgramRegistered:'program',ScoringPolicyRegistered:'program',RulesLocked:'program',ExamDatasetCommitted:'dataset',ScoringVerified:'scoring',ResultRecorded:'result',ConfirmationRecorded:'confirmation',RightIssued:'credential',StatusChanged:'status'};
 const evidence:any[]=[];const latest=await client.getBlockNumber();
 for(let from=c.DEPLOYMENT_BLOCK;from<=latest;from+=2000n){const to=from+1999n<latest?from+1999n:latest;const logs=await client.getContractEvents({address:c.CONTRACT_ADDRESS as Hex,abi,fromBlock:from,toBlock:to});for(const log of logs){const kind=kinds[log.eventName!];if(!kind)continue;const args=log.args as any;const reference=kind==='scoring'?args.resultId:kind==='credential'||kind==='status'?args.credentialId:args.program??args.dataset??args.resultId;if(!accepted.has(reference))continue;evidence.push({kind,reference,eventName:log.eventName,logIndex:log.logIndex,...(kind==='scoring'?{programId:args.program}:{}),receipt:{chainId:c.CHAIN_ID,contractAddress:c.CONTRACT_ADDRESS,transactionHash:log.transactionHash,blockNumber:String(log.blockNumber)}});}}
 const verifier=await chain.read('scoringVerifier');
 const manifest=evidenceManifestSchema.parse({schema:1,definitionId:DEFINITION_ID,definitionDigest,instanceId:scenario.instanceId,chainId:c.CHAIN_ID,registry:c.CONTRACT_ADDRESS,verifier,verificationKeySha256:createHash('sha256').update(fs.readFileSync('../zk/scoring/target/vk')).digest('hex'),deploymentBlock:String(c.DEPLOYMENT_BLOCK),recordedAt:new Date().toISOString(),roles,deployments,evidence,bindings:{datasetId:run.authenticatedInput.datasetId,programIds:run.programIds,students},...(source.security?{security:source.security}:{})});
 fs.writeFileSync(temp,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 service=new DemoWorldService({...c,DEMO_REPLAY_MANIFEST:temp},connection.store,chain,scoring);const snapshot=await service.snapshot();if(snapshot.state!=='verified')throw Error('Evidence did not reconcile as current. No final manifest was exported.');
 fs.linkSync(temp,out);fs.unlinkSync(temp);console.log('Public evidence exported and reconciled:',out,'No transactions submitted.');
}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);await service?.close();await scoring.close();await connection.close();}
