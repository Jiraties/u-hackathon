import type {Express} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import type {Config} from './config.js';
import type {Store} from './store.js';
import type {ChainGateway} from './chain.js';
import {createSessionTokens} from './auth.js';
import {tokenHash} from './crypto.js';
import {createDemoScenario} from './demo/scenario.js';

export const localDemoAccessEnabled=(config:Config,local:boolean)=>
  config.DEMO_JUDGE_ACCESS===true && local && config.CHAIN_ID===31337 && !config.DEMO_READ_ONLY;

/** Password-free entry is limited to fixed fictional accounts on an explicitly enabled local EVM. */
export const registerLocalDemoAccess=(app:Express,config:Config,store:Store,chain:ChainGateway,enabled:boolean)=>{
 const tokens=createSessionTokens(config);
 const candidates=()=>[
  ...createDemoScenario(config.DEMO_WORLD_INSTANCE??'preparation').expected.map(s=>({id:s.studentId,name:s.name})),
  {id:'demo-pim',name:'Pim (new result)'},{id:'demo-narin',name:'Narin (new result)'},
 ];
 app.get('/v1/auth/demo-access',async(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!enabled){res.json({enabled:false});return;}
  const students=[];
  for(const s of candidates())if(await store.students.findOne({_id:s.id})){
   const records=await store.results.find({studentId:s.id}).toArray();
   students.push({...s,hasResults:records.length>0,outcome:records.at(-1)?.report.outcome});
  }
  const institution=!!await store.operators.findOne({_id:'demo-office',institutionId:config.INSTITUTION_ID});
  res.json({enabled:true,students,institution});
 });
 app.post('/v1/auth/demo-access',rateLimit({windowMs:60000,limit:20}),async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!enabled){res.status(404).json({error:'demo_access_unavailable'});return;}
  const input=z.discriminatedUnion('role',[
   z.object({role:z.literal('student'),studentId:z.string().max(100)}).strict(),
   z.object({role:z.literal('institution')}).strict(),
  ]).parse(req.body);
  // Check the actual RPC/registry too, before issuing a session with write capabilities.
  await chain.ready();
  const studentId=input.role==='student'?input.studentId:'demo-office';
  const account=input.role==='student'
   ? candidates().some(s=>s.id===studentId)&&await store.students.findOne({_id:studentId})
   : await store.operators.findOne({_id:'demo-office',institutionId:config.INSTITUTION_ID});
  if(!account){res.status(404).json({error:'demo_account_unavailable'});return;}
  const issued=await tokens.issue(input.role);
  const expiresAt=new Date(Math.min(issued.expiresAt.getTime(),Date.now()+60*60*1000));
  const institutionId=input.role==='institution'?config.INSTITUTION_ID:undefined;
  await store.sessions.insertOne({_id:tokenHash(issued.token),studentId,role:input.role,institutionId,expiresAt,demo:true});
  res.json({token:issued.token,expiresAt,institutionId,name:account.name,demo:true});
 });
};
