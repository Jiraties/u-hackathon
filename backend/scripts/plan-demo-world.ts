// Public artifact planning only. No private-key loading and no RPC writes.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { getContractAddress, type Address } from 'viem';
import { createDemoScenario, definitionDigest } from '../src/demo/scenario.js';
import { linkBytecode } from '../src/zk/artifacts.js';
const signers=JSON.parse(fs.readFileSync('../docs/demo-world/signers.public.json','utf8'));
const roles=Object.fromEntries(Object.entries(signers.roles).map(([k,v])=>[k,(v as {address:Address}).address]));
if(new Set(Object.values(roles).map(a=>a.toLowerCase())).size!==4)throw Error('Distinct roles required');
const hashes=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const libraries:Record<string,Address>={};
const contracts=['RelationsLib','ZKTranscriptLib','HonkVerifier','FairPassRegistryV2'].map((name,i)=>{
 const a=JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8'));
 const bytecode=linkBytecode(a,libraries);
 const predictedAddress=getContractAddress({from:roles.admin,nonce:BigInt(i)});
 libraries[name]=predictedAddress;
 return {name,predictedAddress,adminNonce:i,creationBytes:(bytecode.length-2)/2,unlinkedBytecodeSha256:createHash('sha256').update(a.bytecode).digest('hex'),linkedBytecodeSha256:createHash('sha256').update(bytecode).digest('hex')};
});
const scenario=createDemoScenario('fuji-replay-001');
const plan={schema:1,status:'prepared_not_deployed',chainId:43113,roles,contracts,addressAssumption:'Fresh admin has nonce 0. Any prior admin transaction requires a new reviewed plan.',verificationKeySha256:hashes('../zk/scoring/target/vk'),circuitSourceSha256:hashes('../zk/scoring/src/main.nr'),definitionDigest,scenarioInstance:scenario.instanceId,registryDatabase:'fairpass_demo_world_v2_fuji_001',requiresApproval:['funding','four_contract_deployments','issuer_authorization','dataset_publication','rule_publication','result_publication','proof_transactions','confirmations_and_rights'],externalTransactionsSubmitted:0};
fs.writeFileSync('../docs/demo-world/fuji-plan.json',JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync('../docs/demo-world/scenario.json',JSON.stringify(scenario,null,2)+'\n');
console.log(JSON.stringify(plan,null,2));
