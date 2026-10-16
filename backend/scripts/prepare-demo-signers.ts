// Offline only: no RPC, funding or deployment calls.
import fs from 'node:fs';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parse } from 'dotenv';
const root=path.resolve('.secrets/demo-world-fuji');
const publicFile=path.resolve('../docs/demo-world/signers.public.json');
if(fs.existsSync(publicFile))throw new Error('Signer manifest already exists; preserve secure accounts.');
fs.mkdirSync(root,{recursive:true,mode:0o700});fs.chmodSync(root,0o700);
const forbidden=new Set(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0x70997970c51812dc3a010c7d01b50e0d17dc79c8','0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc']);
const roles:Record<string,{address:string;secretFile:string}>={};
for(const role of ['admin','allocationAuthority','institutionalIssuer','examinationAuthority']){
 const key=generatePrivateKey();const address=privateKeyToAccount(key).address;
 if(forbidden.has(address.toLowerCase()))throw new Error('Unexpected address collision');forbidden.add(address.toLowerCase());
 const file=path.join(root,role+'.env');
 fs.writeFileSync(file,`CHAIN_ID=43113\nADDRESS=${address}\nPRIVATE_KEY=${key}\n`,{mode:0o600,flag:'wx'});
 roles[role]={address,secretFile:path.relative(path.resolve('..'),file)};
}
for(const role of Object.values(roles)){
 const file=path.resolve('..',role.secretFile);const data=parse(fs.readFileSync(file));
 if((fs.statSync(file).mode&0o777)!==0o600||privateKeyToAccount(data.PRIVATE_KEY as `0x${string}`).address!==role.address)throw new Error('Signer storage verification failed');
}
const manifest={schema:1,chainId:43113,network:'Avalanche Fuji',purpose:'fictional Demo World V2 only',createdAt:new Date().toISOString(),roles,externalTransactionsSubmitted:0};
fs.writeFileSync(publicFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(manifest,null,2));
