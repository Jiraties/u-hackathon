import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPublicClient,createWalletClient,defineChain,http,parseEther,type Hex,type Address } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { readConfig } from '../src/config.js';
const run=promisify(execFile);
if(process.env.FAIRPASS_ALLOW_FUJI_KEYS!=='true')throw new Error('Explicit Fuji key migration flag is required');
const config=readConfig();
if(config.CHAIN_ID!==43113)throw new Error('Fuji only; mainnet is refused');
const chain=defineChain({id:43113,name:'Fuji',nativeCurrency:{name:'AVAX',symbol:'AVAX',decimals:18},rpcUrls:{default:{http:[config.RPC_URL]}}});
const client=createPublicClient({chain,transport:http(config.RPC_URL)});
if(await client.getChainId()!==43113)throw new Error('RPC mismatch');
fs.mkdirSync('deployments',{recursive:true});
const statePath=path.resolve('deployments/fuji-private-signers.json');
type State={admin:Hex;authority:Hex;issuer:Hex;contractAddress?:Address;deploymentBlock?:string;funding?:string[]};
const state:State=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{admin:generatePrivateKey(),authority:generatePrivateKey(),issuer:generatePrivateKey(),funding:[]};
const persist=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
persist();fs.chmodSync(statePath,0o600);
if(state.contractAddress?.toLowerCase()===config.CONTRACT_ADDRESS.toLowerCase()) {
  console.log('Private Fuji registry is already active:',state.contractAddress);
  process.exit(0);
}
const funder=privateKeyToAccount(config.ISSUER_PRIVATE_KEY as Hex);
const wallet=createWalletClient({account:funder,chain,transport:http(config.RPC_URL)});
const targets=[state.admin,state.authority,state.issuer].map(key=>privateKeyToAccount(key));
const value=parseEther('0.02');
if(await client.getBalance({address:funder.address})<parseEther('0.065'))throw new Error('Need 0.065 test AVAX in the existing issuer for this migration; no real AVAX is used');
for(const target of targets){
  if(await client.getBalance({address:target.address})>=parseEther('0.001'))continue;
  const hash=await wallet.sendTransaction({to:target.address,value});
  const receipt=await client.waitForTransactionReceipt({hash,timeout:120000});
  if(receipt.status!=='success')throw new Error('Test AVAX funding reverted');
  state.funding!.push(hash);persist();
  console.log('Funded private Fuji signer:',target.address,'transaction:',hash);
}
const env={...process.env,ADMIN_PRIVATE_KEY:state.admin,ADMIN_ADDRESS:targets[0].address,AUTHORITY_PRIVATE_KEY:state.authority,ISSUER_PRIVATE_KEY:state.issuer,ALLOW_MAINNET:'false'};
if(!state.contractAddress || !await client.getCode({address:state.contractAddress})){
  const output=await run(process.execPath,['dist/scripts/deploy.js'],{env});
  const match=output.stdout.match(/Set CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40}) and DEPLOYMENT_BLOCK=(\d+)/);
  if(!match)throw new Error('Missing deployment manifest');
  state.contractAddress=match[1] as Address;state.deploymentBlock=match[2];persist();
}
await run(process.execPath,['dist/scripts/bootstrap.js'],{env:{...env,CONTRACT_ADDRESS:state.contractAddress}});
const source=fs.readFileSync('.env','utf8'),backup='.env.before-private-fuji';
if(!fs.existsSync(backup))fs.writeFileSync(backup,source,{mode:0o600});
const changes:Record<string,string>={ADMIN_PRIVATE_KEY:state.admin,ADMIN_ADDRESS:targets[0].address,AUTHORITY_PRIVATE_KEY:state.authority,ISSUER_PRIVATE_KEY:state.issuer,CONTRACT_ADDRESS:state.contractAddress,DEPLOYMENT_BLOCK:state.deploymentBlock!,MONGODB_DATABASE:'fairpass_fuji_'+state.contractAddress.slice(2,14),ALLOW_MAINNET:'false'};
let updated=source;
for(const [name,value] of Object.entries(changes)){
  const expression=new RegExp('^'+name+'=.*$','m');
  updated=expression.test(updated)?updated.replace(expression,name+'='+value):updated+'\n'+name+'='+value+'\n';
}
fs.writeFileSync('.env.next',updated,{mode:0o600});fs.renameSync('.env.next','.env');fs.chmodSync('.env',0o600);
console.log('Activated private-key Fuji registry:',state.contractAddress);
console.log('Deployment block:',state.deploymentBlock);
console.log('Admin:',targets[0].address,'Authority:',targets[1].address,'Issuer:',targets[2].address);
console.log('Old .env preserved at',backup,'; keys remain server-only with mode 600.');
