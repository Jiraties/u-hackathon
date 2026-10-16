import {api,type Wallet,type Proof} from '../services/api';
import type {DemoWorldSnapshot} from '../../../backend/shared/demoWorld';
export type World=DemoWorldSnapshot;
export const chapters=[{id:'rules',label:'The rules',role:'University'},{id:'proof',label:'Private scoring',role:'Examination authority'},{id:'allocation',label:'Six places',role:'Admissions authority'},{id:'students',label:'Your result',role:'Students'},{id:'verify',label:'Check the proof',role:'Public verifier'}] as const;
let cached:{value:World;until:number}|undefined;
let inflight:Promise<World>|undefined;
export const loadWorld=(fresh=false):Promise<World>=>{
 if(!fresh&&cached&&cached.until>Date.now())return Promise.resolve(cached.value);
 return inflight??=api<World>('/demo/world').then(value=>{cached={value,until:Date.now()+15000};return value;}).finally(()=>{inflight=undefined;});
};
export const progressKey='fairpass-demo-journey-v1';
export const cleanName=(value:string)=>value.replace(/ · Fictional program$/, '').replace(/ \(fictional demonstration\)$/, '');
export const replayWallet=(student:World['students'][number])=>student.wallet as unknown as Wallet;
export const replayProof=(student:World['students'][number])=>student.proof as unknown as Proof;
export const networkLabel=(world:World)=>world.mode==='fuji'?'Avalanche Fuji':world.mode==='local'?'Local V2 test chain':'Preparation · Fuji pending';
