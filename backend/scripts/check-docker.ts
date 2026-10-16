import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AdmissionRulebook } from '../shared/domain.js';
const base=process.env.DOCKER_TEST_URL ?? 'http://127.0.0.1:18080/api';
const snapshot=process.env.DOCKER_TEST_SNAPSHOT ?? path.join(tmpdir(),'fairpass-docker-check.json');
const password='local-docker-fictional-test-password';
async function call(route:string,token?:string,body?:unknown):Promise<any>{
  const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  assert.ok(response.ok,`${route}: HTTP ${response.status}`);
  return response.json();
}
const ready=await call('/ready');
assert.equal(ready.chainId,31337,'This check is local-only; it refuses Fuji and mainnet');
const admin='fairpass-local-admin-token-not-for-public-use';
const login=async(studentId:string)=>(await call('/v1/auth/login',undefined,{studentId,password})).token;
if(process.argv[2]==='persisted'){
  const saved=JSON.parse(fs.readFileSync(snapshot,'utf8'));
  assert.equal(ready.contractAddress,saved.contractAddress);
  const wallet=await call('/v1/me/wallet',await login(saved.studentId));
  assert.equal(wallet.records[0].resultId,saved.resultId);
  assert.equal(wallet.records[0].credential.credentialId,saved.credentialId);
  assert.equal((await call('/v1/public/verify/'+saved.credentialId)).status,'valid');
  console.log('Docker recreate preserved result and credential:',saved.credentialId);
}else{
  const stamp=Date.now(), studentId='docker-pim-'+stamp, operatorId='docker-office-'+stamp;
  await call('/v1/admin/students',admin,{studentId,name:'Docker fictional student',password});
  await call('/v1/admin/operators',admin,{operatorId,name:'Docker fictional office',institutionId:'fairpass-demo',password});
  const token=(await call('/v1/auth/institution/login',undefined,{operatorId,password})).token;
  const rule:AdmissionRulebook={id:'docker-rule-'+stamp,programId:'docker-engineering',institutionId:'fairpass-demo',programName:'Docker Fictional Engineering',faculty:'Engineering',academicYear:2027,round:'docker-'+stamp,capacity:1,version:1,method:'normalized-weighted-sum',components:[{scoreId:'gpax',label:'GPAX',source:'demo-school-record',sourceComponentId:'GPAX',maximum:4,transformation:'normalize-to-100',weightPercent:100,minimumPercent:null}],requiredSubjects:[],qualifications:[],status:'draft',createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null};
  const published=await call('/v1/office/rulebooks/publish',token,rule);
  await call('/v1/office/simulations',token,{runId:'docker-run-'+stamp,programIds:[published.programId],applicants:[{id:studentId,preferences:[rule.programId],qualifications:{},scores:[{id:'gpax',label:'GPAX',subject:'GPAX',score:3.6,maximum:4,provenance:'simulated-exam-provider'}]}]});
  const studentToken=await login(studentId), wallet=await call('/v1/me/wallet',studentToken), resultId=wallet.records[0].resultId;
  await call('/v1/me/results/'+resultId+'/confirm',studentToken,{});
  const issued=await call('/v1/issuer/results/'+resultId+'/issue',token,{});
  assert.equal((await call('/v1/public/verify/'+issued.credentialId)).status,'valid');
  fs.writeFileSync(snapshot,JSON.stringify({studentId,resultId,credentialId:issued.credentialId,contractAddress:ready.contractAddress}));
  console.log('Docker workflow passed; persistence snapshot:',snapshot);
  console.log('Credential:',issued.credentialId);
}
