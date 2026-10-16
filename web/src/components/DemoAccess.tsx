import {useEffect,useState} from 'react';
import {api,errorMessage,type Session} from '../services/api';
import {Icon} from './Icon';

type DemoAccessOptions={enabled:boolean;replay?:boolean;institution?:boolean;students?:{id:string;name:string;hasResults:boolean;outcome?:'admitted'|'not_admitted'}[]};
export const DemoAccess=({role,onLogin}:{role:'student'|'institution';onLogin:(session:Session)=>void})=>{
 const [options,setOptions]=useState<DemoAccessOptions|null>(null);
 const [studentId,setStudentId]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void api<DemoAccessOptions>('/auth/demo-access',{signal:controller.signal}).then(value=>{
   if(controller.signal.aborted)return;
   setOptions(value);
   const preferred=(value.replay?value.students?.find(s=>s.name==='Pim'):undefined)??value.students?.find(s=>s.hasResults&&s.name==='Pim')??value.students?.find(s=>s.hasResults)??value.students?.[0];
   setStudentId(preferred?.id??'');
  }).catch(()=>{/* Normal sign-in remains available when demo access is disabled. */});
  return()=>controller.abort();
 },[]);
 if(!options||(!options.enabled&&!options.replay)||(role==='institution'&&!options.institution))return null;
 const replayLink=(id:string)=>`/demo/students?student=${encodeURIComponent(id)}`;
 const rejected=options.students?.find(s=>s.outcome==='not_admitted');
 const enter=async(chosenStudentId=studentId)=>{
  setBusy(true);setError('');
  try{onLogin(await api<Session>('/auth/demo-access',{method:'POST',body:role==='student'?{role,studentId:chosenStudentId}:{role}}));}
  catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 };
 return <aside className="judge-demo-access" aria-label="Judge demo access">
  <h2>Here to try FairPass?</h2>
  <p>{role==='student'?'Open a fictional student’s wallet and explore their result, token and proof.':options.replay?'Explore the university’s published scoring rules and their blockchain evidence.':'Use the university workspace to create rulebooks, process fictional applicants and issue admission tokens.'}</p>
  {role==='student'?<label>Choose a demo student<select aria-label="Choose a demo student" value={studentId} onChange={e=>setStudentId(e.target.value)} disabled={busy}>{options.students?.map(s=><option key={s.id} value={s.id}>{s.name}{s.outcome==='admitted'?' · Admitted':s.outcome==='not_admitted'?' · Not admitted':' · No result yet'}</option>)}</select></label>:null}
  {options.replay?<a className="button button-secondary" href={role==='student'?replayLink(studentId):'/demo/rules'}>{role==='student'?'Try student demo':'Try university demo'}<Icon name="arrow" size={17}/></a>:<button type="button" className="button button-secondary" onClick={()=>void enter()} disabled={busy||(role==='student'&&!studentId)}>{busy?'Opening demo…':role==='student'?'Try student demo':'Try university demo'}<Icon name="arrow" size={17}/></button>}
  {role==='student'&&rejected?(options.replay?<a className="button button-secondary" href={replayLink(rejected.id)}>Try non-admitted demo<Icon name="arrow" size={17}/></a>:<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void enter(rejected.id)}>Try non-admitted demo<Icon name="arrow" size={17}/></button>):null}
  {error?<p className="live-error" role="alert">{error}</p>:null}
  <small>{options.replay?'No password needed. Explore fictional records in the read-only Fuji demo. No account is created.':'No password needed. Shared fictional accounts on a local test chain. No real AVAX is spent.'}</small>
 </aside>;
};

export const DemoSessionNotice=({institution=false,onLogin}:{institution?:boolean;onLogin?:(session:Session)=>void})=><aside className="judge-demo-notice" aria-label="Demo session"><strong>You’re using a shared local demo.</strong><p>{institution?'Create a new program for 2027, Round 3, and select the prepared scenario students for authenticated exam records. Existing rulebooks stay locked. For a new token, choose a student without an active admission right for that year.':'Explore an admitted student’s token or a non-admitted student’s result and explanation. These are fictional records.'} All changes use the local test chain.</p><a href={institution?'/student/wallet':'/university'}>{institution?'Open student wallet':'Open university workspace'}<Icon name="arrow" size={15}/></a>{onLogin?<details className="judge-demo-switch"><summary>Switch demo student</summary><DemoAccess role="student" onLogin={onLogin}/></details>:null}</aside>;
