import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureLocalDemoAccounts} from '../src/localDemoAccounts.js';
import {passwordHash,passwordMatches} from '../src/crypto.js';
import type {Store} from '../src/store.js';

test('fresh local databases receive usable demo accounts; existing passwords are preserved',async()=>{
  const students=new Map<string,any>(),operators=new Map<string,any>();let inserts=0;
  const collection=(records:Map<string,any>)=>({findOne:async(q:{_id:string})=>records.get(q._id)??null,insertOne:async(record:any)=>{records.set(record._id,record);inserts++;}});
  const store={students:collection(students),operators:collection(operators)} as unknown as Pick<Store,'students'|'operators'>;
  const settings={local:true,chainId:31337,password:'password',institutionId:'fairpass-demo'};
  await ensureLocalDemoAccounts(store,settings);assert.equal(inserts,3);
  for(const account of [...students.values(),...operators.values()])assert.equal(await passwordMatches('password',account.passwordHash),true);
  assert.equal(operators.get('demo-office').institutionId,'fairpass-demo');
  operators.get('demo-office').passwordHash=await passwordHash('custom-existing-password');
  await ensureLocalDemoAccounts(store,settings);assert.equal(inserts,3);
  assert.equal(await passwordMatches('custom-existing-password',operators.get('demo-office').passwordHash),true);
});
test('external networks and non-local mode never create demo accounts',async()=>{
  const untouched={students:{findOne:()=>{throw Error('unexpected access');}},operators:{findOne:()=>{throw Error('unexpected access');}}} as unknown as Pick<Store,'students'|'operators'>;
  await ensureLocalDemoAccounts(untouched,{local:false,chainId:31337,institutionId:'example'});
  await ensureLocalDemoAccounts(untouched,{local:true,chainId:43113,institutionId:'example'});
});
