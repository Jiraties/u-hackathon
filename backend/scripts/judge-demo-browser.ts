import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';
const base='http://localhost:8080',captures='cache/judge-demo';fs.mkdirSync(captures,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/student/wallet');await page.getByRole('button',{name:'Try student demo',exact:true}).waitFor();
  await page.screenshot({path:`${captures}/student-login-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Try student demo',exact:true}).click();await page.getByRole('heading',{name:'Your admission. Now a token.',exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/student/wallet');await page.getByLabel('Demo session',{exact:true}).waitFor();
  await page.screenshot({path:`${captures}/student-wallet-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Try non-admitted demo',exact:true}).waitFor();
  await page.getByRole('button',{name:'Try non-admitted demo',exact:true}).click();await page.getByRole('heading',{name:'Not admitted',exact:true}).waitFor();
  assert.equal(await page.getByRole('article',{name:'Your admission token',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Request confirmation',exact:true}).count(),0);
  await page.screenshot({path:`${captures}/non-admitted-${width}.png`,fullPage:true});
  await page.goto(base+'/university');await page.getByRole('button',{name:'Try university demo',exact:true}).waitFor();
  await page.screenshot({path:`${captures}/university-login-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Try university demo',exact:true}).click();await page.getByRole('button',{name:'Create rulebook',exact:true}).waitFor();
  await page.screenshot({path:`${captures}/university-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Create rulebook',exact:true}).click();await page.getByLabel('Program slug',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Try university demo',exact:true}).waitFor();
  assert.deepEqual(errors,[]);await context.close();console.log(`Judge entry passed at ${width}px: both student outcomes, university builder and sign out without a password.`);
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),office=await context.newPage(),student=await context.newPage();
 for(const p of [office,student])p.on('dialog',d=>d.accept());
 const snapshot=await(await office.request.get(base+'/api/v1/demo/world')).json();
 const people=['Narin','Dao'].map(name=>snapshot.scenario.expected.find((s:any)=>s.name===name));
 const slug=`judge-check-${Date.now()}`,name=`Judge Engineering ${slug}`;
 await office.goto(base+'/university');await office.getByRole('button',{name:'Try university demo',exact:true}).click();
 await office.getByRole('button',{name:'Create rulebook',exact:true}).click();await office.getByLabel('Program slug',{exact:true}).fill(slug);await office.getByLabel('Program name',{exact:true}).fill(name);
 await office.getByRole('button',{name:'Save draft',exact:true}).click();await office.getByText('Draft saved. You can open it on another device.',{exact:true}).waitFor();
 for(let i=0;i<3;i++)await office.getByRole('button',{name:'Continue',exact:true}).click();
 await office.getByRole('button',{name:'Publish on Avalanche',exact:true}).click();await office.getByRole('heading',{name:'Rules locked on chain',exact:true}).waitFor({timeout:180000});
 await office.getByRole('button',{name:'All rulebooks',exact:false}).click();await office.getByRole('button',{name:'Process admissions',exact:true}).click();await office.getByRole('checkbox',{name:`${name} · Round 3`,exact:true}).check();
 for(const [i,person]of people.entries()){
  await office.getByRole('button',{name:'Add fictional applicant',exact:true}).click();await office.getByLabel(`Student account ${i+1}`,{exact:true}).selectOption(person.studentId);
  const applicant=snapshot.scenario.applicants.find((a:any)=>a.id===person.studentId);
  for(const [j,label]of ['TGAT / 100','Mathematics 1 / 100','Physics / 100'].entries())await office.getByLabel(label,{exact:true}).nth(i).fill(String(applicant.scores[j].score));
 }
 await office.getByRole('button',{name:'Preview allocation',exact:true}).click();await office.getByRole('button',{name:'Process and record results',exact:true}).click();await office.getByText('Results are saved and recorded.',{exact:false}).waitFor({timeout:180000});
 await student.goto(base+'/student/wallet');await student.getByLabel('Choose a demo student',{exact:true}).selectOption(people[0].studentId);await student.getByRole('button',{name:'Try student demo',exact:true}).click();
 await student.getByRole('heading',{name:'Admission offered',exact:true}).waitFor();await student.getByRole('button',{name:'Verify private scoring',exact:true}).click();await student.getByRole('heading',{name:'Your calculation has been checked.',exact:true}).waitFor({timeout:180000});
 await student.getByRole('button',{name:'Request confirmation',exact:true}).click();await student.getByText('Confirmation requested. Waiting for institution issuance.',{exact:true}).waitFor();
 await office.getByRole('button',{name:'Issue admission tokens',exact:true}).click();await office.getByLabel('Issuance program').selectOption({label:`${name} · Round 3`});
 await office.getByRole('button',{name:'Continue',exact:true}).click();await office.getByRole('button',{name:'Refresh confirmations',exact:true}).first().click();await office.getByRole('checkbox',{name:people[0].studentId,exact:true}).check();
 await office.getByRole('button',{name:'Review & issue',exact:true}).click();await office.getByRole('button',{name:'Issue 1 tokens',exact:true}).click();await office.getByText('1 admission tokens issued.',{exact:true}).waitFor({timeout:180000});
 await student.reload();await student.getByRole('heading',{name:'Your admission. Now a token.',exact:true}).waitFor();await student.getByRole('link',{name:'Verify',exact:true}).click();await student.getByRole('heading',{name:'Valid admission right',exact:true}).waitFor();
 await student.screenshot({path:`${captures}/issued-verification.png`,fullPage:true});await context.close();
 console.log('Judge university journey passed: saved draft, locked policy, processed cohort, real ZK verification, confirmation, issuance and public verification.');
}finally{for(const [i,context]of browser.contexts().entries())for(const [j,page]of context.pages().entries())await page.screenshot({path:`${captures}/last-${i}-${j}.png`,fullPage:true}).catch(()=>{});await browser.close();}
