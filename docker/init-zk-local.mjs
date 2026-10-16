import fs from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPublicClient,createWalletClient,http} from 'viem';
if(process.env.FAIRPASS_LOCAL!=='true'||process.env.CHAIN_ID!=='31337')throw Error('Local ZK init only');
const client=createPublicClient({transport:http(process.env.RPC_URL)});
if(await client.getChainId()!==31337)throw Error('Local RPC required');
const vkHash=createHash('sha256').update(fs.readFileSync('/zk/scoring/target/vk')).digest('hex');
const file='/app/deployments/local.json';
if(fs.existsSync(file)){
 const previous=JSON.parse(fs.readFileSync(file));
 if(previous.protocolVersion===2&&await client.getCode({address:previous.contractAddress})){
  if(previous.verificationKeySha256!==vkHash)throw Error('Circuit changed: explicitly plan a new isolated local deployment; existing records were preserved.');
  console.log('Reusing isolated local ZK registry',previous.contractAddress);process.exit(0);
 }
}
const wallet=createWalletClient({transport:http(process.env.RPC_URL)});
const exam=(await wallet.getAddresses())[3];
const run=promisify(execFile);
const deployed=await run(process.execPath,['dist/scripts/deploy-zk.js'],{env:{...process.env,EXAM_AUTHORITY_ADDRESS:exam}});
const progress=JSON.parse(fs.readFileSync('/app/deployments/zk-31337-progress.json'));
const registry=progress.deployments.find(d=>d.name==='FairPassRegistryV2');
if(!registry)throw Error('ZK deployment incomplete');
const manifest={chainId:31337,protocolVersion:2,contractAddress:registry.address,deploymentBlock:registry.block,database:`fairpass_zk_${randomBytes(8).toString('hex')}`,verificationKeySha256:vkHash,examinationAuthority:exam};
fs.writeFileSync(file,JSON.stringify(manifest,null,2));console.log('Isolated ZK demo initialized:',manifest.contractAddress);
