import 'dotenv/config';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomId} from '../src/crypto.js';
import {readConfig} from '../src/config.js';
import {connectStore} from '../src/store.js';
if(process.env.FAIRPASS_LOCAL!=='true'||process.env.CHAIN_ID!=='31337'||process.env.REGISTRY_VERSION!=='2')throw Error('Seed only the isolated local ZK demo');
const base=process.env.API_URL??'http://127.0.0.1:3001';const password='password';
async function call(path:string,body?:unknown,token?:string){const response=await fetch(base+'/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(response.status===409)return null;if(!response.ok)throw Error(`Demo request failed: ${path}, HTTP ${response.status}`);return response.status===204?null:await response.json() as any;}
for(const [studentId,name]of [['demo-pim','Pim (fictional)'],['demo-narin','Narin (fictional)']])await call('/admin/students',{studentId,name,password},process.env.ADMIN_API_TOKEN);
await call('/admin/operators',{operatorId:'demo-office',name:'Fictional university officer',institutionId:'fairpass-demo',password},process.env.ADMIN_API_TOKEN);
const office=(await call('/auth/institution/login',{operatorId:'demo-office',password})).token;
const programs=await call('/public/programs');
const existing=programs.find((p:any)=>p.rulebook?.programId==='zk-computer-engineering');
const rule={id:'zk-computer-engineering-v1',institutionId:'fairpass-demo',programId:'zk-computer-engineering',programName:'Computer Engineering · Fictional program',faculty:'Faculty of Engineering',academicYear:2027,round:'Round 3',capacity:1,version:1,method:'normalized-weighted-sum',components:[['tgat','TGAT',20],['math1','Mathematics 1',40],['physics','Physics',40]].map(([id,label,weight])=>({scoreId:id,label,source:'demo-exam-provider',sourceComponentId:id,maximum:100,transformation:'normalize-to-100',weightPercent:weight,minimumPercent:50})),requiredSubjects:['tgat','math1','physics'],qualifications:[],status:'draft',createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null};
const program=existing??await call('/office/rulebooks/publish',rule,office);
if(!program)throw Error('Program publication unavailable');
const scores=(values:number[])=>['tgat','math1','physics'].map((id,i)=>({id,subject:id,label:id,score:values[i],maximum:100,provenance:'simulated-exam-provider'}));

fs.mkdirSync('cache',{recursive:true});const manifestFile='cache/zk-demo-exams.json';
const config=readConfig();const connection=await connectStore(config.MONGODB_URI,config.MONGODB_DATABASE);
const existingDataset=await connection.store.examDatasets.findOne({year:2027,round:3,version:1});await connection.close();
if(!fs.existsSync(manifestFile))fs.writeFileSync(manifestFile,JSON.stringify({fictional:true,datasetId:existingDataset?._id??randomId(),year:2027,round:'Round 3',version:1,expiresAt:existingDataset?.expiresAt??Math.floor(Date.now()/1000)+30*86400,records:[{studentId:'demo-pim',recordVersion:1,scores:{tgat:81.23,math1:73.45,physics:90.67}},{studentId:'demo-narin',recordVersion:1,scores:{tgat:40.12,math1:91.23,physics:82.34}}]}),{mode:0o600});
const committed=spawnSync(process.execPath,['--import','./docker/runtime.mjs','dist/scripts/commit-exams.js',manifestFile],{stdio:'inherit',env:process.env});if(committed.status!==0)throw Error('Exam authentication failed');
await call('/office/simulations',{runId:'zk-local-demo-v1',programIds:[program.programId],applicants:[{id:'demo-pim',scores:scores([81.23,73.45,90.67]),preferences:[rule.programId],qualifications:{}},{id:'demo-narin',scores:scores([40.12,91.23,82.34]),preferences:[rule.programId],qualifications:{}}]},office);
// Proofs are generated through the real authenticated service, not seeded flags.
for(const studentId of ['demo-pim','demo-narin']){
 const token=(await call('/auth/login',{studentId,password})).token;
 const wallet=await call('/me/wallet',undefined,token);const result=wallet.records.find((r:any)=>r.report.runId==='zk-local-demo-v1');if(!result)throw Error('Result missing');
 await call(`/me/results/${result.resultId}/scoring`,{programId:program.programId},token);
 if(studentId==='demo-pim'){
  await call(`/me/results/${result.resultId}/confirm`,{},token);
  await call(`/issuer/results/${result.resultId}/issue`,{},office);
 }
 await call('/auth/logout',{},token);
}
await call('/auth/institution/logout',{},office);
console.log('Local ZK demo ready. demo-office, demo-pim and demo-narin use password. Both private proofs are real; only Pim receives an admission token.');
