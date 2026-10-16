import 'dotenv/config';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,createWalletClient,defineChain,http,isAddress,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {linkBytecode} from '../src/zk/artifacts.js';
const chainId=Number(process.env.CHAIN_ID??43113);
if(![31337,43113].includes(chainId))throw Error('ZK deployment supports local EVM and Avalanche Fuji only');
const artifacts=['RelationsLib','ZKTranscriptLib','HonkVerifier','FairPassRegistryV2'].map(name=>({name,...JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8'))}));
const plan={roles:{admin:process.env.ADMIN_ADDRESS||null,allocationAuthority:process.env.ALLOCATION_AUTHORITY_ADDRESS||null,institutionalIssuer:process.env.ISSUER_ADDRESS||null,examinationAuthority:process.env.EXAM_AUTHORITY_ADDRESS||null},chainId,network:chainId===43113?'Avalanche Fuji':'local EVM',contracts:artifacts.map(a=>({name:a.name,unlinkedBytecodeSha256:createHash('sha256').update(a.bytecode).digest('hex')})),circuitVerificationKeySha256:createHash('sha256').update(fs.readFileSync('../zk/scoring/target/vk')).digest('hex'),actions:['Deploy two generated verifier libraries','Deploy the circuit-specific, immutable ZK Honk verifier','Deploy a new v2 registry with allocation and examination authority roles','Authorize the configured institutional issuer on the new registry'],migration:'Existing v1 deployment, rights and database remain untouched. Use a separate v2 database and new rulebook publications.'};
console.log(JSON.stringify(plan,null,2));
if(process.argv.includes('--plan'))process.exit(0);
if(chainId!==31337&&process.env.CONFIRM_ZK_DEPLOYMENT!=='true')throw Error('Review and approve this concrete deployment plan first. Only then set CONFIRM_ZK_DEPLOYMENT=true.');
const rpc=process.env.RPC_URL;if(!rpc)throw Error('Set RPC_URL');
const admin=privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex);
const allocation=process.env.ALLOCATION_AUTHORITY_ADDRESS??(process.env.AUTHORITY_PRIVATE_KEY?privateKeyToAccount(process.env.AUTHORITY_PRIVATE_KEY as Hex).address:undefined);
const issuer=process.env.ISSUER_ADDRESS??(process.env.ISSUER_PRIVATE_KEY?privateKeyToAccount(process.env.ISSUER_PRIVATE_KEY as Hex).address:undefined);
const exam=process.env.EXAM_AUTHORITY_ADDRESS;
if(!allocation||!issuer||!exam||![allocation,issuer,exam].every(value=>isAddress(value))||new Set([admin.address,allocation,issuer,exam].map(a=>a.toLowerCase())).size!==4)throw Error('Four distinct admin, allocation, institutional issuer and examination authority addresses required');
// External V2 execution must match the prepared secure-account and artifact plan.
if(chainId!==31337){
 const reviewed=JSON.parse(fs.readFileSync('../docs/demo-world/fuji-plan.json','utf8'));
 const actualRoles={admin:admin.address,allocationAuthority:allocation,institutionalIssuer:issuer,examinationAuthority:exam};
 for(const [role,address]of Object.entries(actualRoles))if(reviewed.roles[role]?.toLowerCase()!==address.toLowerCase())throw Error('Signer differs from prepared Demo World plan');
 if(reviewed.verificationKeySha256!==plan.circuitVerificationKeySha256)throw Error('Verification key differs from prepared plan');
 for(const a of artifacts)if(reviewed.contracts.find((c:any)=>c.name===a.name)?.unlinkedBytecodeSha256!==createHash('sha256').update(a.bytecode).digest('hex'))throw Error('Artifact differs from prepared plan');
}
const chain=defineChain({id:chainId,name:'FairPass ZK',nativeCurrency:{name:'AVAX',symbol:'AVAX',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc)});if(await client.getChainId()!==chainId)throw Error('RPC chain mismatch');
if(chainId!==31337 && await client.getTransactionCount({address:admin.address,blockTag:'pending'})!==0)throw Error('Admin nonce changed: review predicted addresses before deployment');
const wallet=createWalletClient({account:admin,chain,transport:http(rpc)});
const feeCap=process.env.MAX_FEE_PER_GAS_WEI?BigInt(process.env.MAX_FEE_PER_GAS_WEI):undefined;
if(feeCap && await client.getGasPrice()>feeCap)throw Error('Network fee exceeds configured deployment cap');
const fees=feeCap?{maxFeePerGas:feeCap,maxPriorityFeePerGas:160n}:{};
const libraries:Record<string,Address>={};const deployments=[];
fs.mkdirSync('deployments',{recursive:true});
for(const artifact of artifacts){
 const args=artifact.name==='FairPassRegistryV2'?[admin.address,allocation,exam,libraries.HonkVerifier]:[];
 const hash=await wallet.deployContract({abi:artifact.abi,bytecode:linkBytecode(artifact,libraries),args,...fees});
 const receipt=await client.waitForTransactionReceipt({hash,timeout:120000});if(receipt.status!=='success'||!receipt.contractAddress)throw Error('Deployment reverted');
 libraries[artifact.name]=receipt.contractAddress;deployments.push({name:artifact.name,address:receipt.contractAddress,transactionHash:hash,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed)});
 // Durable public-only progress. Never persist signing keys or witnesses.
 fs.writeFileSync(`deployments/zk-${chainId}-progress.json`,JSON.stringify({plan,deployments},null,2));
}
const registry=artifacts.find(a=>a.name==='FairPassRegistryV2')!;
const {request}=await client.simulateContract({address:libraries.FairPassRegistryV2,abi:registry.abi,functionName:'authorizeInstitution',args:[issuer,true],account:admin,...fees});
const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Issuer authorization reverted');
const manifest={...plan,deployments,registry:libraries.FairPassRegistryV2,verifier:libraries.HonkVerifier,admin:admin.address,allocationAuthority:allocation,examinationAuthority:exam,issuer,authorizationTransaction:hash,deploymentBlock:deployments.find(d=>d.name==='FairPassRegistryV2')!.block};
fs.writeFileSync(`deployments/zk-${chainId}-${manifest.registry}.json`,JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
console.log(`Configure REGISTRY_VERSION=2, CONTRACT_ADDRESS=${manifest.registry}, DEPLOYMENT_BLOCK=${manifest.deploymentBlock}, and a NEW MONGODB_DATABASE.`);
