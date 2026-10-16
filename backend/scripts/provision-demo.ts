import 'dotenv/config';
import { z } from 'zod';
const base = process.env.API_URL ?? 'http://127.0.0.1:3001';
const localDemo = process.env.FAIRPASS_LOCAL === 'true' && process.env.CHAIN_ID === '31337';
const password = (localDemo ? z.union([z.string().min(12).max(128), z.literal('password')]) : z.string().min(12).max(128)).parse(process.env.DEMO_PASSWORD);
const token = z.string().min(32).parse(process.env.ADMIN_API_TOKEN);
const institutionId = process.env.INSTITUTION_ID ?? 'fairpass-demo';
const call = async (path:string, body:unknown) => {
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  if(response.status===409) return 'already provisioned; existing password is unchanged';
  if(!response.ok) throw new Error(`Provisioning failed: ${path}, HTTP ${response.status}`);
  return 'created';
};
for(const studentId of ['demo-pim','demo-narin'])
  console.log(studentId,await call('/v1/admin/students',{studentId,name:studentId==='demo-pim'?'Pim (fictional)':'Narin (fictional)',password}));
console.log('demo-office',await call('/v1/admin/operators',{operatorId:'demo-office',name:'Demo officer',institutionId,password}));
console.log('Use your DEMO_PASSWORD to sign in. This command creates accounts only; no chain transactions.');
