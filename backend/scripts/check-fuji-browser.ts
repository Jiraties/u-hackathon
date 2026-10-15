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
  await page.goto(base+'/university');
  await page.getByLabel('Operator ID').fill(operatorId);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Program slug').fill('fuji-ui-engineering');await page.getByLabel('Admission round').fill('fuji-ui-'+stamp);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Publish and lock rules',exact:true}).click();
  await page.getByRole('heading',{name:'Rules locked on chain',exact:true}).waitFor({timeout:180000});
  await page.getByLabel('Locked program').selectOption({label:'Fictional Engineering · fuji-ui-'+stamp});
  await page.getByLabel('Student ID 1',{exact:true}).fill(studentId);await page.getByLabel('TGAT / 100',{exact:true}).fill('95');
  await page.getByRole('button',{name:'Add fictional applicant',exact:true}).click();await page.getByLabel('Student ID 2',{exact:true}).fill(rejectedId);await page.getByLabel('TGAT / 100',{exact:true}).nth(1).fill('50');
  await page.getByRole('button',{name:'Process and record results',exact:true}).click();await page.getByText('Results are saved and recorded.',{exact:false}).waitFor({timeout:180000});
  await page.screenshot({path:path.join(directory,'institution.png'),fullPage:true});
  await page.goto(base+'/student/wallet');await page.getByLabel('Student ID',{exact:true}).fill(studentId);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Admission offered',exact:true}).waitFor();await page.getByRole('button',{name:'Check result integrity',exact:true}).click();await page.getByRole('heading',{name:'Result integrity: verified',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Request confirmation',exact:true}).click();await page.getByText('Confirmation requested. Waiting for institution issuance.',{exact:true}).waitFor();
  await page.goto(base+'/university');await page.getByRole('button',{name:'Issue admission right',exact:true}).click();await page.getByRole('link',{name:'Public verification',exact:true}).waitFor({timeout:180000});
  await page.getByRole('link',{name:'Public verification',exact:true}).click();await page.getByRole('heading',{name:'Valid admission right',exact:true}).waitFor({timeout:60000});
  const credentialId=new URL(page.url()).pathname.split('/').pop()!;
  const credential=await fetch(base+'/api/v1/public/verify/'+credentialId).then(r=>r.json()) as {status:string;programId:string};
  assert.equal(credential.status,'valid');
  const programs=await fetch(base+'/api/v1/public/programs').then(r=>r.json()) as {programId:string;rulesMatch:boolean;lock:unknown}[];
  const program=programs.find(p=>p.programId===credential.programId)!;assert.ok(program?.rulesMatch);
  await page.screenshot({path:path.join(directory,'verification.png'),fullPage:true});
  await page.goto(base+'/transparency');await page.getByRole('heading',{name:'Fictional Engineering',exact:true}).waitFor();await page.screenshot({path:path.join(directory,'transparency.png'),fullPage:true});
  await page.goto(base+'/student/wallet');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
  await page.getByLabel('Student ID',{exact:true}).fill(rejectedId);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Not admitted',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Verify admission right',exact:true}).count(),0);
  await page.screenshot({path:path.join(directory,'non-admitted.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({recording:true,fictional:true,checkedAt:new Date().toISOString(),...ready,credential,program},null,2));
  console.log('Fuji browser journey passed. Credential:',credentialId);
  console.log('Screenshots, evidence and recorded fallback:',directory);
} finally { await context.close(); await browser.close(); }
