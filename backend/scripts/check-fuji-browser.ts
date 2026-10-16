import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { randomId } from '../src/crypto.js';
import { readConfig } from '../src/config.js';

if(process.env.FAIRPASS_ALLOW_FUJI_DEMO !== 'true') throw new Error('Set FAIRPASS_ALLOW_FUJI_DEMO=true to explicitly allow fictional Fuji transactions');
const config=readConfig();
assert.equal(config.CHAIN_ID,43113,'Fuji only: never run this on mainnet');
const base=process.env.BROWSER_DEMO_URL ?? 'http://127.0.0.1:8080';
const ready=await fetch(base+'/api/ready').then(r=>r.json()) as {chainId:number;contractAddress:string};
assert.equal(ready.chainId,43113);
assert.equal(ready.contractAddress.toLowerCase(),config.CONTRACT_ADDRESS.toLowerCase());
const stamp=Date.now(), studentId='fuji-pim-'+stamp, rejectedId='fuji-narin-'+stamp, operatorId='fuji-office-'+stamp;
const password=randomId(); // Temporary fictional account credentials; never printed.
async function provision(route:string,body:unknown){
  const response=await fetch(base+'/api/v1'+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.ADMIN_API_TOKEN}`},body:JSON.stringify(body)});
  assert.ok(response.ok,`Provisioning failed: HTTP ${response.status}`);
}
await provision('/admin/operators',{operatorId,name:'Fuji fictional officer',institutionId:config.INSTITUTION_ID,password});
for(const id of [studentId,rejectedId])await provision('/admin/students',{studentId:id,name:id===studentId?'Pim (fictional)':'Narin (fictional)',password});
const directory=path.resolve('cache/fuji-demo');fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:directory,size:{width:1440,height:1000}}});
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
try {
  const {browserJourney}=await import('./browser-journey.js');
  const student=await context.newPage();
  const credentialId=await browserJourney({office:page,student,base,operatorId,studentId,rejectedId,password,round:'fuji-ui-'+stamp});
  const credential=await fetch(base+'/api/v1/public/verify/'+credentialId).then(r=>r.json()) as {status:string;programId:string};
  assert.equal(credential.status,'valid');
  const programs=await fetch(base+'/api/v1/public/programs').then(r=>r.json()) as {programId:string;rulesMatch:boolean;lock:unknown}[];
  const program=programs.find(p=>p.programId===credential.programId)!;assert.ok(program?.rulesMatch);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({recording:true,fictional:true,checkedAt:new Date().toISOString(),...ready,credential,program},null,2));
  console.log('Fuji browser journey passed. Credential:',credentialId);
  console.log('Screenshots, evidence and recorded fallback:',directory);
} finally { await context.close(); await browser.close(); }
