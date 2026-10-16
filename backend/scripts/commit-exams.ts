// This command belongs to the independent fictional examination authority.
// Never put its signing key into the running API environment.
import 'dotenv/config';
import fs from 'node:fs';
import { z } from 'zod';
import { createPublicClient,createWalletClient,defineChain,http,type Hex } from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {connectStore} from '../src/store.js';
import {ScoringProver} from '../src/zk/prover.js';
import {freshField,roundCode,SUBJECTS,hundredths} from '../src/zk/encoding.js';
import {randomId} from '../src/crypto.js';
const config=z.object({REGISTRY_VERSION:z.coerce.number(),CHAIN_ID:z.coerce.number(),RPC_URL:z.url(),CONTRACT_ADDRESS:z.string().regex(/^0x[0-9a-fA-F]{40}$/),MONGODB_URI:z.string(),MONGODB_DATABASE:z.string()}).parse(process.env);
if(config.REGISTRY_VERSION!==2)throw Error('REGISTRY_VERSION=2 required');
if(config.CHAIN_ID!==31337 && process.env.CONFIRM_EXAM_ROOT_PUBLICATION!=='true')throw Error('Confirm the external dataset publication plan first; then set CONFIRM_EXAM_ROOT_PUBLICATION=true');
const file=process.argv[2];if(!file)throw Error('Usage: commit-exams <private-fictional-exam-records.json>');
const input=z.object({fictional:z.literal(true),datasetId:z.string().regex(/^0x[0-9a-fA-F]{64}$/),year:z.number().int().min(2020).max(2100),round:z.string(),version:z.number().int().positive(),expiresAt:z.number().int().positive(),records:z.array(z.object({studentId:z.string().min(1),recordVersion:z.number().int().positive(),scores:z.record(z.string(),z.number())})).min(1).max(256)}).parse(JSON.parse(fs.readFileSync(file,'utf8')));
const local=defineChain({id:config.CHAIN_ID,name:'FairPass exam authority',nativeCurrency:{name:'AVAX',symbol:'AVAX',decimals:18},rpcUrls:{default:{http:[config.RPC_URL]}}});
const client=createPublicClient({chain:local,transport:http(config.RPC_URL)});
if(await client.getChainId()!==config.CHAIN_ID)throw Error('Chain mismatch');
const wallet=createWalletClient({chain:local,transport:http(config.RPC_URL)});
const account=process.env.EXAM_AUTHORITY_PRIVATE_KEY?privateKeyToAccount(process.env.EXAM_AUTHORITY_PRIVATE_KEY as Hex):config.CHAIN_ID===31337?(await wallet.getAddresses())[3]:undefined;
if(!account)throw Error('Set the examination authority signer in this CLI process only');
const abi=JSON.parse(fs.readFileSync('artifacts/FairPassRegistryV2.json','utf8')).abi;
const signer=typeof account==='string'?account:account.address;
const role=await client.readContract({address:config.CONTRACT_ADDRESS as Hex,abi,functionName:'EXAM_AUTHORITY'});
if(!await client.readContract({address:config.CONTRACT_ADDRESS as Hex,abi,functionName:'hasRole',args:[role,signer]}))throw Error('Signer lacks EXAM_AUTHORITY');
const {store,close}=await connectStore(config.MONGODB_URI,config.MONGODB_DATABASE);const prover=await ScoringProver.create();
try{
  let dataset=await store.examDatasets.findOne({_id:input.datasetId as Hex});
  if(!dataset){
    const records=[];
    for(const r of input.records){
      if(!await store.students.findOne({_id:r.studentId}))throw Error('Student must be provisioned first');
      const entries=Object.entries(r.scores).map(([id,score])=>({id:SUBJECTS[id],score:hundredths(score)})).sort((a,b)=>a.id-b.id);
      if(entries.length!==3||entries.some(e=>!e.id))throw Error('Exactly three supported exam subjects required');
      records.push({studentId:r.studentId,subject:await store.subject(r.studentId,input.year,randomId()),recordVersion:r.recordVersion,salt:freshField(),subjects:entries.map(e=>e.id),scores:entries.map(e=>e.score)});
    }
    dataset=await prover.dataset({_id:input.datasetId as Hex,year:input.year,round:roundCode(input.round),version:input.version,expiresAt:input.expiresAt},records);
    await store.examDatasets.insertOne(dataset);
  }
  const current=await client.readContract({address:config.CONTRACT_ADDRESS as Hex,abi,functionName:'datasets',args:[dataset._id]}) as any;
  if(current[0] && current[0]!==BigInt(dataset.root))throw Error('Dataset commitment conflict');
  if(!current[0]){
    const {request}=await client.simulateContract({address:config.CONTRACT_ADDRESS as Hex,abi,functionName:'commitExamDataset',args:[dataset._id,BigInt(dataset.root),dataset.year,dataset.round,dataset.version,dataset.expiresAt],account});
    const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Dataset transaction reverted');
    await store.examDatasets.updateOne({_id:dataset._id},{$set:{publication:{chainId:config.CHAIN_ID,contractAddress:config.CONTRACT_ADDRESS as Hex,transactionHash:hash,blockNumber:String(receipt.blockNumber)}}});
  }
  console.log('Authenticated fictional dataset committed:',dataset._id,'root:',dataset.root);
}finally{await prover.close();await close();}
