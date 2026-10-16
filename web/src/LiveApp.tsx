import { useEffect, useState, useRef, type FormEvent, type ReactNode } from "react";
import { Icon } from "./components/Icon";
import { Badge } from "./components/ui";
import { ShareTokenButton } from "./components/ShareTokenButton";
import { normalizeCredentialCode } from "./services/demoVerification";
import { Layout, type PageId } from "./components/Layout";
import {
  api,
  ApiError,
  bytes32,
  errorMessage,
  type Credential,
  type EventPage,
  type OfficeResult,
  type Proof,
  type PublicProgram,
  type Receipt,
  type Session,
  type Wallet,
} from "./services/api";
import {
  allocatePreview,
  evaluateRulebook,
  examComponents,
  validateRulebook,
  rulebookCommitment,
  type AdmissionRulebook,
} from "./domain/rulebooks";

function useSession(role: "student" | "institution") {
  const key = `fairpass-session-${role}`;
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(key) ?? "null",
      ) as Session | null;
      return saved && Date.parse(saved.expiresAt) > Date.now() ? saved : null;
    } catch {
      return null;
    }
  });
  const save = (value: Session | null) => {
    setSession(value);
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* Memory session remains usable. */
    }
  };
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => save(null),
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  return { session, save };
}
function useRequest() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
const Alert = ({ children }: { children: ReactNode }) => (
  <p className="live-error" role="alert">
    {children}
  </p>
);
const Heading = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) => (
  <div className="live-heading">
    {eyebrow === "404" ? <p>404</p> : null}
    <h1>{title}</h1>
    {children ? <p>{children}</p> : null}
  </div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="live-field">
    <span>{label}</span>
    {children}
  </label>
);
const Json = ({
  value,
  label = "Technical evidence",
}: {
  value: unknown;
  label?: string;
}) => (
  <details>
    <summary>{label}</summary>
    <pre className="live-json">{JSON.stringify(value, null, 2)}</pre>
  </details>
);
function ReceiptView({ value }: { value: Receipt | null | undefined }) {
  if (!value)
    return (
      <p>No transaction receipt is saved. Check the chain before retrying.</p>
    );
  const url =
    value.chainId === 43113
      ? "https://testnet.snowtrace.io/tx/"
      : value.chainId === 43114
        ? "https://snowtrace.io/tx/"
        : null;
  return (
    <p className="live-id">
      Block {value.blockNumber} ·{" "}
      {url ? (
        <a href={url + value.transactionHash} target="_blank" rel="noreferrer">
          {value.transactionHash}
        </a>
      ) : (
        value.transactionHash
      )}
    </p>
  );
}
function Network({
  value,
}: {
  value: { chainId: number; contractAddress: string };
}) {
  return (
    <p className="live-id">
      Chain {value.chainId} · Contract {value.contractAddress}
    </p>
  );
}
function SignIn({
  role,
  onLogin,
}: {
  role: "student" | "institution";
  onLogin: (session: Session) => void;
}) {
  const [id, setId] = useState(""),
    [password, setPassword] = useState("");
  const { busy, error, run } = useRequest();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      onLogin(
        await api<Session>(
          role === "student" ? "/auth/login" : "/auth/institution/login",
          {
            method: "POST",
            body: {
              [role === "student" ? "studentId" : "operatorId"]: id.trim(),
              password,
            },
          },
        ),
      );
      setPassword("");
    });
  };
  return (
    <section className="panel live-panel live-signin">
      <Heading
        eyebrow={
          role === "student" ? "PRIVATE STUDENT WALLET" : "INSTITUTION ACCESS"
        }
        title="Sign in"
      >
        {role === "student"
          ? "Open your saved results and admission rights."
          : "Only authorized institutional accounts can publish rules and issue rights."}
      </Heading>
      <form onSubmit={submit}>
        <Field label={role === "student" ? "Student ID" : "Operator ID"}>
          <input
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={role === "student" ? "e.g. demo-pim" : "e.g. demo-office"}
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <Alert>{error}</Alert> : null}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        {role === "student" ? (
          <>University staff? <a href="/university">Sign in for universities</a>.</>
        ) : (
          <>Student? <a href="/student/wallet">Sign in to My wallet</a>.</>
        )}
      </p>
      <p>
        Accounts are provisioned by the platform administrator. No wallet
        connection is required.
      </p>
    </section>
  );
}
function StudentWallet() {
  const {session,save}=useSession("student");
  const [wallet,setWallet]=useState<Wallet|null>(null),[selected,setSelected]=useState(""),[proof,setProof]=useState<Proof|null>(null);
  const tokenDialog=useRef<HTMLDialogElement>(null), proofDialog=useRef<HTMLDialogElement>(null);
  const {busy,error,run}=useRequest();
  const refresh=async()=>{try{setWallet(await api<Wallet>("/me/wallet",{token:session!.token}));}catch(e){if(e instanceof ApiError&&e.status===401)save(null);throw e;}};
  useEffect(()=>{let active=true;if(session) void api<Wallet>("/me/wallet",{token:session.token}).then(w=>{if(active)setWallet(w);}).catch(e=>{if(active){if(e instanceof ApiError&&e.status===401)save(null);void run(async()=>{throw e;});}});else{setWallet(null);setProof(null);}return()=>{active=false;};},[session]);
  if(!session)return <SignIn role="student" onLogin={save}/>;
  const record=wallet?.records.find(r=>r.resultId===selected)??wallet?.records[wallet.records.length-1];
  const credential=record?.report.outcome==="admitted"?record.credential:null;
  const rules=record?.report.rulebooks??[];
  const program=rules.find(r=>r.id===record?.program?.rulebookId)??(rules.length===1?rules[0]:undefined);
  const name=wallet?.student.name??session.name??"";
  const check=()=>void run(async()=>{setProof(await api<Proof>(`/me/results/${record!.resultId}/proof`,{token:session.token}));proofDialog.current?.showModal();});
  const pass=credential&&wallet?<article className="token-card" aria-label="Your admission token"><div className="token-top"><span className="token-issuer-mark"><Icon name="graduation" size={24}/></span><div><span className="token-caption">Issued by</span><h3>{record?.program?.institutionName??"Registered institution"}</h3></div><Icon name="graduation" size={28}/></div><div className="token-main"><span className="token-type">Admission token</span><h2>{program?.programName??"Confirmed admission"}</h2><p>{program?.degree??program?.faculty??record?.program?.degree??""}</p><div className="token-meta"><div><span>Academic year</span><strong>{record!.report.academicYear}</strong></div><div><span>Current status</span><strong><i className={`token-status-dot ${credential.status==='valid'?'active':credential.status}`}/>{credential.lifecycle==='valid'?'Active':credential.lifecycle[0].toUpperCase()+credential.lifecycle.slice(1)}</strong></div></div></div><div className="token-bottom"><div><span className="token-caption">Token ID</span><strong title={credential.credentialId}>{credential.credentialId.slice(0,12)}…{credential.credentialId.slice(-6)}</strong></div><span className="token-sample">Fictional admissions</span></div><div className="token-network"><Icon name="globe" size={16}/><span>{networkName(wallet.chainId)}</span><span className="network-notice">Read from chain</span></div></article>:null;
  const trace=record?<section className="proof-section trace-section" id="result-trace" tabIndex={-1}><div className="section-heading"><div><h2>Follow your result</h2><p>Your scores and the rulebook versions used for this round.</p></div></div><div className="connected-rule-traces">{rules.map(rule=>{
    const scores=record.report.scoreRecords;
    const calculation=scores?evaluateRulebook(rule,scores,record.report.qualifications??{}):null;
    return <details key={rule.id} open={rules.length===1}><summary>{rule.programName} · v{rule.version}</summary><div className="calculation-trace"><div className="trace-node"><span className="trace-node-dot">1</span><div><h4>Your exam scores</h4><div className="score-inputs">{(scores??Object.entries(record.report.scores).map(([id,score])=>({id,label:id,score,maximum:100}))).map(s=><div key={s.id}><span>{s.label}</span><strong>{s.score}<small> / {s.maximum}</small></strong></div>)}</div><p className="fine-print">Fictional inputs · Score authenticity not verified</p></div></div><div className="trace-node"><span className="trace-node-dot">2</span><div><h4>Program scoring rules</h4><div className="formula-terms">{rule.components.map(c=><div key={c.scoreId}><span>{c.label} × {c.weightPercent}%</span><strong>Scale {c.maximum}</strong></div>)}</div><details><summary>View rulebook evidence</summary><p>These are the pinned rules for this result. A newer version does not replace them.</p><Json value={rule}/></details></div></div><div className="trace-node"><span className="trace-node-dot">3</span><div><h4>Calculated from your scores</h4><strong className="trace-total">{calculation?.status==='calculated'?calculation.total.toFixed(2):'Unavailable'}<small> / 100</small></strong><p className="fine-print">Recalculated locally · Does not authenticate the inputs</p></div></div><div className="trace-node"><span className="trace-node-dot">4</span><div><h4>Eligibility</h4><strong>{calculation?.status==='calculated'?calculation.eligible?'Meets minimums':'Below a minimum':'Requirements unavailable'}</strong><p className="fine-print">Eligibility does not guarantee a seat.</p></div></div></div></details>;
  })}</div>{!rules.length?<p>No pinned rulebook is available for this historical result.</p>:null}<div className="allocation-note"><Icon name="info" size={20}/><p>A score explains the calculation. Checking the complete allocation also needs all applicants, preferences, capacity and selection rules.</p></div><button className="button button-secondary" disabled={busy} onClick={check}>Check result integrity</button><Json value={record.report} label="Private report details"/></section>:null;
  return <div className="wallet-page"><div className="wallet-welcome"><span>Hi, {name}<span className="welcome-dot">.</span></span><button className="text-button" disabled={busy} onClick={()=>void run(async()=>{try{await api('/auth/logout',{method:'POST',token:session.token});}finally{save(null);}})}>Sign out</button></div><div className="wallet-heading"><h1>{credential?'Your admission. Now a token.':record?.report.outcome==='not_admitted'?'Your result. Clearly explained.':'Your next chapter starts here.'}</h1><p>{credential?'Issued by your institution. Ready to be checked. No crypto wallet needed.':'Your admission result and supporting records in one place.'}</p></div>{error?<Alert>{error}</Alert>:null}{!wallet?<p role="status">Loading your records…</p>:null}{wallet&&wallet.records.length>1?<Field label="Admission round"><select value={record?.resultId} onChange={e=>{setSelected(e.target.value);setProof(null);}}>{wallet.records.map(r=><option key={r.resultId} value={r.resultId}>{r.report.academicYear} · {r.report.round}</option>)}</select></Field>:null}
  {credential?<div className="wallet-hero"><section className="wallet-pass-section"><div className="pass-stack">{pass}</div><div className="token-actions"><button className="button button-primary" onClick={()=>tokenDialog.current?.showModal()}>View token <Icon name="arrow" size={18}/></button><a className="button button-secondary" href={`/verify/${credential.credentialId}`}><Icon name="shield" size={18}/>Verify</a><ShareTokenButton credentialId={credential.credentialId} live/></div><p className="wallet-pass-note"><Icon name="lock" size={14}/>Non-transferable. An academic record, not a financial asset.</p></section><aside className="wallet-story"><span className="story-symbol"><Icon name="graduation" size={28}/></span><h2>A university-issued token.<br/>A record you can share.</h2><p>Your program and current status in one checkable record.</p><ConnectedGuide/><div className="quiet-privacy"><Icon name="lock" size={20}/><p>Your name and scores stay in your private account.</p></div></aside></div>:record?<div className="result-overview"><section className="admission-result-card"><div className="result-card-heading"><Icon name="file" size={23}/><span>Admission Result</span><Badge tone="blue">Fictional report</Badge></div><p className="result-card-year">Academic year {record.report.academicYear}</p><h2>{record.report.outcome==='admitted'?'Admission offered':'Not admitted'}</h2><p className="result-card-round">{record.report.round}</p>{record.report.outcome==='admitted'?record.confirmationRequestedAt?<p role="status">Confirmation requested. Waiting for institution issuance.</p>:<button disabled={busy} className="button button-primary" onClick={()=>{if(confirm('Confirm admission? The institution will issue your admission token separately.'))void run(async()=>{await api(`/me/results/${record.resultId}/confirm`,{method:'POST',token:session.token});await refresh();});}}>Request confirmation</button>:<a className="button button-primary" href="#result-trace">See why <Icon name="arrow" size={18}/></a>}<div className="result-card-foot"><span>{record.report.outcome==='admitted'?'Offer recorded':'No admission right issued'}</span></div></section><aside className="wallet-story"><h2>Your result record</h2><p>An offer and an issued admission token are separate records.</p><button className="button button-secondary" disabled={busy} onClick={check}>Check result integrity</button><ConnectedGuide/></aside></div>:wallet?<section className="quiet-empty"><Icon name="clock" size={30}/><h2>No results yet</h2><p>Your institution has not published a result for this account.</p><button className="button button-secondary" disabled={busy} onClick={()=>void run(refresh)}>Refresh records</button></section>:null}
  {credential?<details className="score-drawer result-drawer"><summary><Icon name="chart" size={22}/><span><strong>Scores and admission result</strong><small>Private records for this round</small></span><Icon name="down" size={18}/></summary>{trace}</details>:trace}
  {record?<details className="connected-evidence"><summary>View blockchain details</summary><Network value={wallet!}/><p className="live-id">Result: {record.resultId}</p><ReceiptView value={record.issuance??record.publication}/></details>:null}
  <dialog ref={tokenDialog} className="token-dialog" aria-labelledby="live-token-title"><form method="dialog" className="dialog-close"><button className="close-button" aria-label="Close token details">×</button></form><h2 id="live-token-title">Your admission token</h2>{pass}<p className="live-id">{credential?.credentialId}</p><p>A valid record does not establish the presenter’s identity.</p></dialog>
  <dialog ref={proofDialog} className="rule-proof-dialog" aria-labelledby="live-proof-title"><form method="dialog" className="dialog-close"><button className="close-button" aria-label="Close result evidence">×</button></form><h2 id="live-proof-title">Result integrity: {proof?.verification.resultIntegrity??'Checking'}</h2><p>The private report is compared with its commitment on chain.</p><dl className="detail-list"><div><dt>Score authenticity</dt><dd>Not verified</dd></div><div><dt>Allocation correctness</dt><dd>Not verified</dd></div></dl><Json value={proof}/></dialog>
  </div>;
}
const networkName=(id:number)=>id===43113?'Avalanche Fuji':id===43114?'Avalanche C-Chain':`Local chain ${id}`;
function ConnectedGuide(){return <details className="verification-guide"><summary>How verification works <Icon name="down" size={16}/></summary><ol><li>The institution issues the credential.</li><li>Avalanche records its status.</li><li>Anyone can check the public record.</li></ol><p className="fine-print">Fictional admissions. This demo uses public development keys; issuer trust is not secure.</p></details>;}
function Verify(){
  const initial=window.location.pathname.startsWith('/verify/')?window.location.pathname.slice(8):'';
  const [id,setId]=useState(initial),[credential,setCredential]=useState<Credential|null>(null),[missing,setMissing]=useState(false);
  const {busy,error,run}=useRequest();
  const verify=async(value:string)=>{setCredential(null);setMissing(false);const code=normalizeCredentialCode(value);if(!bytes32.test(code))throw new Error('Enter a token ID: 0x followed by 64 hexadecimal characters.');setId(code);try{setCredential(await api<Credential>(`/public/verify/${code}`));window.history.replaceState(null,'',`/verify/${code}`);}catch(e){if(e instanceof ApiError&&e.status===404)setMissing(true);else throw e;}};
  useEffect(()=>{if(initial)void run(()=>verify(initial));},[]);
  return <div className="verify-page"><div className="verify-intro"><span className="verify-symbol"><Icon name="shield" size={31}/></span><h1>A token. A clear answer.</h1><p>Check who issued it, and whether it is still active.</p></div><form className="verification-form" onSubmit={e=>{e.preventDefault();void run(()=>verify(id));}}><label className="field-label" htmlFor="token-code">Token code or verification link</label><div className="verification-input-row"><input id="token-code" autoComplete="off" spellCheck={false} required value={id} onChange={e=>{setId(e.target.value);setCredential(null);setMissing(false);}} placeholder="0x… or a FairPass link"/><button className="button button-primary" disabled={busy}>{busy?'Checking chain…':'Verify token'} <Icon name="arrow" size={19}/></button></div><p className="fine-print">Checks the configured registry. Student names and scores stay private.</p></form>{error?<Alert>{error}</Alert>:null}{missing?<section className="verification-result result-not_found" role="status"><h2>Token not found</h2><p>Check the ID and network, then try again.</p></section>:null}{credential?<section className={`verification-result result-${credential.status==='valid'?'valid':credential.status}`} aria-live="polite"><div className="result-top"><span className="result-symbol"><Icon name={credential.status==='valid'?'check':'info'} size={28}/></span><Badge>{networkName(credential.chainId)}</Badge></div><h2>{credential.lifecycle==='enrolled'?'Enrolled':credential.status==='valid'?'Valid admission right':credential.status==='withdrawn'?'This token was withdrawn.':'This token was revoked.'}</h2><p className="result-description">{credential.status==='valid'?'This credential is active in the configured registry.':'This credential is no longer an active admission right.'}</p><div className="verified-record"><span className="issuer-avatar"><Icon name="university" size={26}/></span><div><h3>{credential.metadata?.institutionName??'Registered issuer'}</h3><p>{credential.metadata?.programName??'Admission token'}</p><span>Academic year {credential.academicYear}</span></div></div><dl className="detail-list"><div><dt>Issuer currently authorized</dt><dd>{credential.issuerCurrentlyAuthorized?'Yes':'No — check with the institution before accepting this record.'}</dd></div><div><dt>Token ID</dt><dd>{credential.credentialId}</dd></div></dl><details className="connected-evidence"><summary>View blockchain details</summary><Network value={credential}/><Json value={credential}/></details><a className="text-link" href={`/transparency?program=${credential.programId}`}>See this program’s public capacity <Icon name="arrow" size={17}/></a><p className="fine-print">Fictional admissions. Public development keys do not establish trusted university identity.</p></section>:!missing&&!error&&!busy?<div className="verification-empty"><Icon name="file" size={28}/><p>A university-issued token can be checked without a student’s name or exam scores.</p></div>:null}<ConnectedGuide/><p className="verifier-identity"><Icon name="lock" size={16}/>A valid record does not establish the presenter’s identity.</p></div>;
}
function Transparency(){
  const [programs,setPrograms]=useState<PublicProgram[]>([]),[selected,setSelected]=useState(new URLSearchParams(location.search).get('program')??''),[events,setEvents]=useState<EventPage|null>(null);
  const {busy,error,run}=useRequest();const generation=useRef(0);
  const refresh=async()=>setPrograms(await api<PublicProgram[]>('/public/programs'));
  useEffect(()=>{void run(refresh);},[]);
  const program=programs.find(p=>p.programId===selected)??programs[0];
  useEffect(()=>{generation.current++;setEvents(null);},[program?.programId]);
  const loadEvents=async(from?:string)=>{if(!program)return;const gen=generation.current;const page=await api<EventPage>(`/public/programs/${program.programId}/events?fromBlock=${from??program.registration?.blockNumber??program.deploymentBlock}`);if(gen===generation.current)setEvents(old=>from&&old?{...page,events:[...old.events,...page.events]}:page);};
  const circumference=2*Math.PI*104,percentage=program?Math.min(program.active/Math.max(program.capacity,1),1):0;
  const titles:Record<string,string>={ProgramRegistered:'Program registered',RulesLocked:'Rules locked',RulesRevised:'Rulebook revised',RightIssued:'Admission token issued',RightEnrolled:'Enrollment recorded',RightWithdrawn:'Admission right withdrawn',RightRevoked:'Admission token revoked',CapacityChanged:'Capacity updated',ReallocationAuthorized:'Seat reallocation authorized'};
  return <div className="focused-page transparency-page"><Heading eyebrow="" title="Every seat, accounted for.">See the admission limit, active rights, and the changes behind them.</Heading>{error?<Alert>{error}</Alert>:null}{busy?<p role="status">Loading chain evidence…</p>:null}{!busy&&!error&&!program?<section className="quiet-empty"><h2>No programs yet</h2><p>Published programs will appear here.</p></section>:null}{program?<><div className="public-program-picker"><div><span className="issuer-avatar"><Icon name="university" size={24}/></span><div><strong>{program.metadata?.institutionName??'Registered institution'}</strong><span>{networkName(program.chainId)} · Academic year {program.academicYear}</span></div></div><Field label="Choose a program"><select value={program.programId} onChange={e=>setSelected(e.target.value)}>{programs.map(p=><option key={p.programId} value={p.programId}>{p.rulebook?.programName??p.metadata?.programName??p.programId}</option>)}</select></Field></div><section className="capacity-feature"><div className="capacity-visual"><svg className="capacity-ring" viewBox="0 0 250 250" role="img" aria-label={`${program.active} active admission rights out of ${program.capacity} authorized seats`}><circle className="ring-track" cx="125" cy="125" r="104"/><circle className="ring-fill" cx="125" cy="125" r="104" strokeDasharray={`${circumference*percentage} ${circumference}`} transform="rotate(-90 125 125)"/></svg><div className="ring-label"><strong>{program.active}</strong><span>active admission rights</span></div><div className="ring-caption">out of {program.capacity} authorized seats</div></div><div className="capacity-story"><Badge tone={program.active<=program.capacity?'green':'amber'}>{program.active<=program.capacity?'Within limit':'Over capacity'} · On-chain</Badge><h2>{program.capacity} seats.<br/>One shared record.</h2><p>{program.rulebook?.programName??program.metadata?.programName??'Registered program'}</p><dl className="capacity-facts"><div><dt>Authorized capacity</dt><dd>{program.capacity}</dd></div><div><dt>Active admission rights</dt><dd>{program.active}</dd></div><div><dt>Historical tokens issued</dt><dd>{program.historicalIssued}</dd></div><div><dt>Issuance allowance</dt><dd>{program.issuanceAllowance}</dd></div></dl><p className="fine-print">Unoccupied capacity does not automatically authorize reallocation.</p></div></section><div className="transparency-bottom"><section className="timeline-section"><div className="section-heading"><div><h2>What changed?</h2><p>Authorized actions leave a visible history.</p></div></div><button className="button button-secondary" disabled={busy} onClick={()=>void run(()=>loadEvents())}>View registry events</button>{events?<><ol className="public-timeline">{events.events.map(e=><li key={`${e.transactionHash}-${e.logIndex}`}><span className="timeline-symbol"><Icon name="file" size={18}/></span><div><strong>{titles[e.event]??e.event}</strong><p>Block {e.blockNumber}</p><ReceiptView value={{chainId:program.chainId,contractAddress:program.contractAddress,transactionHash:e.transactionHash,blockNumber:e.blockNumber}}/></div></li>)}</ol>{!events.events.length?<p>No events in this block range.</p>:null}<p className="fine-print">Blocks {events.fromBlock}–{events.toBlock}. History is paginated.</p>{events.nextBlock?<button className="button button-secondary" disabled={busy} onClick={()=>void run(()=>loadEvents(events.nextBlock!))}>Load more events</button>:null}</>:null}</section><aside className="guarantees-card"><Icon name="shield" size={29}/><h2>What blockchain can guarantee.</h2><p>Authorized issuance, capacity limits and credential status rules.</p><div className="guarantee-note"><Icon name="info" size={19}/><p>It cannot prove that TCAS selected the right applicants, or account for admissions outside FairPass.</p></div><details><summary>View blockchain details</summary><Network value={program}/><Json value={program}/></details></aside></div></>:null}<p className="fine-print connected-context">Fictional admissions · No university affiliation or official TCAS integration.</p></div>;
}
const defaultRule = (): AdmissionRulebook => ({
  id: `rule-${crypto.randomUUID()}`,
  programId: "demo-engineering",
  institutionId: "fairpass-demo",
  programName: "Fictional Engineering",
  faculty: "Engineering",
  academicYear: 2027,
  round: "demo-1",
  capacity: 1,
  version: 1,
  method: "normalized-weighted-sum",
  components: [
    { ...examComponents[0], weightPercent: 100, minimumPercent: null },
  ],
  requiredSubjects: [],
  qualifications: [],
  status: "draft",
  createdAt: new Date().toISOString(),
  sealedAt: null,
  commitment: null,
  chainReference: null,
  publication: null,
});
function RuleBuilder({
  session,
  refresh, initial, initialRevision=0,
}: {
  session: Session; initial?:AdmissionRulebook; initialRevision?:number;
  refresh: () => Promise<void>;
}) {
  const [rule, setRule] = useState<AdmissionRulebook>(() => ({
      ...(initial??defaultRule()),
      institutionId: session.institutionId!,
    })),
    [step, setStep] = useState(0),
    [hash, setHash] = useState(""),
    [published, setPublished] = useState<{
      programId: string;
      rulesHash: string;
      lock: Receipt | null;
    } | null>(null);
  const { busy, error, run } = useRequest();
  const [revision,setRevision]=useState(initialRevision),[saved,setSaved]=useState(false);
  const saveDraft=async()=>{const value=await api<{revision:number}>("/office/rulebooks/drafts",{method:"POST",token:session.token,body:{rule,expectedRevision:revision}});setRevision(value.revision);setSaved(true);await refresh();};
  const steps = [
    "Program details",
    "Scoring rules",
    "Eligibility",
    "Review rulebook",
  ];
  useEffect(() => {
    setHash("");
    void rulebookCommitment(rule)
      .then(setHash)
      .catch(() => {});
  }, [rule]);
  const patch = (value: Partial<AdmissionRulebook>) => {
    if (busy || published) return;
    setSaved(false);setRule({ ...rule, ...value });
  };
  return (
    <section className="panel live-panel">
      <div className="section-heading"><div><h2>Build a checkable rulebook.</h2><p>One rulebook. A shared reference.</p></div><button className="button button-secondary" disabled={busy||!!published} onClick={()=>void run(saveDraft)}>Save draft</button></div>
      {saved?<p role="status">Draft saved. You can open it on another device.</p>:null}
      <div className="live-steps">
        {steps.map((name, index) => (
          <button
            key={name}
            className={step === index ? "active" : ""}
            onClick={() => setStep(index)}
            aria-current={step === index ? "step" : undefined}
          >
            {index + 1}. {name}
          </button>
        ))}
      </div>
      {step === 0 ? (
        <div className="live-grid">
          {(["programId", "programName", "faculty", "round"] as const).map(
            (key) => (
              <Field
                key={key}
                label={
                  {
                    programId: "Program slug",
                    programName: "Program name",
                    faculty: "Faculty",
                    round: "Admission round",
                  }[key]
                }
              >
                <input
                  value={rule[key]}
                  onChange={(e) => patch({ [key]: e.target.value })}
                />
              </Field>
            ),
          )}
          <Field label="Degree (optional)"><input value={rule.degree??""} onChange={e=>patch({degree:e.target.value||undefined})}/></Field>
          <Field label="Academic year">
            <input
              type="number"
              min="2020"
              max="2100"
              value={rule.academicYear}
              onChange={(e) => patch({ academicYear: Number(e.target.value) })}
            />
          </Field>
          <Field label="Capacity">
            <input
              type="number"
              min="1"
              max="10000"
              value={rule.capacity}
              onChange={(e) => patch({ capacity: Number(e.target.value) })}
            />
          </Field>
        </div>
      ) : null}
      {step === 1 ? (
        <>
          <p>
            Choose components and weights totalling 100%. GPAX uses a 4-point
            scale; exam scores use 100.
          </p>
          <div className="connected-weights" aria-label="Score composition">{rule.components.map((c,i)=><span key={c.scoreId} style={{flex:c.weightPercent,background:["#0075c9","#075da5","#3786cc","#4966a2"][i%4]}} title={`${c.label}: ${c.weightPercent}%`}/>)}</div><p className="fine-print">Total weight: {rule.components.reduce((n,c)=>n+c.weightPercent,0)}%</p>
          {examComponents.map((component) => {
            const selected = rule.components.find(
              (c) => c.scoreId === component.scoreId,
            );
            return (
              <div className="live-component" key={component.scoreId}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={(e) =>
                      patch({
                        components: e.target.checked
                          ? [
                              ...rule.components,
                              {
                                ...component,
                                weightPercent: 1,
                                minimumPercent: null,
                              },
                            ]
                          : rule.components.filter(
                              (c) => c.scoreId !== component.scoreId,
                            ),
                        requiredSubjects: rule.requiredSubjects.filter(
                          (id) => id !== component.scoreId,
                        ),
                      })
                    }
                  />
                  {component.label}
                </label>
                {selected ? (
                  <Field label="Weight %">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="any"
                      value={selected.weightPercent}
                      onChange={(e) =>
                        patch({
                          components: rule.components.map((c) =>
                            c.scoreId === component.scoreId
                              ? { ...c, weightPercent: Number(e.target.value) }
                              : c,
                          ),
                        })
                      }
                    />
                  </Field>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <p>
            Eligibility is checked before ranking; raw scores determine order
            and rounding is for display only.
          </p>
          {rule.components.map((component) => (
            <div className="live-component" key={component.scoreId}>
              <label>
                <input
                  type="checkbox"
                  checked={rule.requiredSubjects.includes(component.scoreId)}
                  onChange={(e) =>
                    patch({
                      requiredSubjects: e.target.checked
                        ? [...rule.requiredSubjects, component.scoreId]
                        : rule.requiredSubjects.filter(
                            (id) => id !== component.scoreId,
                          ),
                    })
                  }
                />
                {component.label} required
              </label>
              <Field label="Minimum % (optional)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={component.minimumPercent ?? ""}
                  onChange={(e) =>
                    patch({
                      components: rule.components.map((c) =>
                        c.scoreId === component.scoreId
                          ? {
                              ...c,
                              minimumPercent:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : c,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ))}
          <Field label="Curriculum">
            <select
              value={rule.qualifications[0]?.equals ?? ""}
              onChange={(e) =>
                patch({
                  qualifications: e.target.value
                    ? [{ field: "curriculum", equals: e.target.value }]
                    : [],
                })
              }
            >
              <option value="">Any curriculum</option>
              <option>Science–Mathematics</option>
              <option>Arts–Languages</option>
            </select>
          </Field>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h3>
            {rule.programName} · {rule.capacity} seats
          </h3>
          <p>
            {rule.academicYear} · {rule.round} · Version {rule.version}
          </p>
          <p className="live-id">
            SHA-256 commitment:{" "}
            {hash || "Complete the fields to calculate a valid commitment."}
          </p>
          {validateRulebook(rule).map((message) => (
            <p key={message} className="live-error">
              {message}
            </p>
          ))}
          <p>
            Publishing registers the program and locks these rules on the
            configured chain. This intake cannot be republished with changed
            rules.
          </p>
          <button
            className="button button-primary"
            disabled={busy || !!published || validateRulebook(rule).length > 0}
            onClick={() =>
              void run(async () => {
                if(!confirm("Publish on Avalanche? These rules will be locked for this intake. Transaction fees apply."))return;
                await saveDraft();
                const result = await api<{
                  programId: string;
                  rulesHash: string;
                  lock: Receipt | null;
                }>("/office/rulebooks/publish", {
                  method: "POST",
                  token: session.token,
                  body: rule,
                });
                if (result.rulesHash !== hash)
                  throw new Error(
                    "The returned commitment does not match this rulebook.",
                  );
                setPublished(result);
                await refresh();
              })
            }
          >
            {busy
              ? "Publishing; waiting for chain…"
              : published
                ? "Rules locked"
                : "Publish on Avalanche"}
          </button>
          <div className="live-proof"><h3>Try a fictional calculation</h3><p>At 75% of each component’s maximum, the weighted score is 75 / 100. Minimums and curriculum still apply.</p></div>
          <Json value={rule} label="Complete rule payload" />
        </>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      {published ? (
        <div role="status">
          <h3>Rules locked on chain</h3>
          <p className="live-id">{published.programId}</p>
          <ReceiptView value={published.lock} />
          <button
            className="button"
            onClick={() => {
              setRule({
                ...defaultRule(),
                institutionId: session.institutionId!,
              });
              setPublished(null);setRevision(0);setSaved(false);
              setStep(0);
            }}
          >
            Create another intake
          </button>
        </div>
      ) : null}
      <div className="live-actions">
        {step > 0 ? (
          <button className="button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < 3 ? (
          <button
            className="button button-primary"
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        ) : null}
      </div>
    </section>
  );
}
function Simulation({session,programs,refresh}:{session:Session;programs:PublicProgram[];refresh:()=>Promise<void>}){
  type Applicant={id:string;scores:Record<string,number>;curriculum:string;preferences:string[]};
  type Payload={runId:string;programIds:string[];applicants:{id:string;scores:import('./domain/models').ScoreRecord[];preferences:string[];qualifications:Record<string,string>}[]};
  const [selected,setSelected]=useState<string[]>([]),[students,setStudents]=useState<{id:string;name:string}[]>([]),[applicants,setApplicants]=useState<Applicant[]>([]),[preview,setPreview]=useState<Record<string,string|null>|null>(null),[pending,setPending]=useState<Payload|null>(null),[completed,setCompleted]=useState(false),[history,setHistory]=useState<{runId:string;completedAt:string|null}[]>([]);
  const {busy,error,run}=useRequest();
  const load=async()=>{const [a,b]=await Promise.all([api<typeof students>('/office/students',{token:session.token}),api<typeof history>('/office/simulations',{token:session.token})]);setStudents(a);setHistory(b);};
  useEffect(()=>{void run(load);},[]);
  const eligible=programs.filter(p=>p.rulebook?.institutionId===session.institutionId&&p.rulesMatch&&p.lockedAt!=='0');
  const chosen=eligible.filter(p=>selected.includes(p.programId)),rules=chosen.map(p=>p.rulebook!);
  const components=[...new Map(rules.flatMap(r=>r.components.map(c=>[c.scoreId,c] as const))).values()];
  const update=(index:number,value:Partial<Applicant>)=>{if(pending)return;setApplicants(old=>old.map((a,i)=>i===index?{...a,...value}:a));setPreview(null);};
  const payload=():Payload=>({runId:`run-${crypto.randomUUID()}`,programIds:selected,applicants:applicants.map(a=>({id:a.id,preferences:a.preferences,qualifications:{curriculum:a.curriculum},scores:components.map(c=>({id:c.scoreId,subject:c.label,label:c.label,maximum:c.maximum,score:a.scores[c.scoreId],provenance:'simulated-exam-provider'}))}))});
  const process=async(body:Payload)=>{setPending(body);await api('/office/simulations',{method:'POST',token:session.token,body});setCompleted(true);await refresh();await load();};
  return <section className="panel live-panel"><h2>Process admissions</h2><p>Fictional applicants. One completed cohort per intake.</p><fieldset disabled={busy||!!pending}><legend>Choose locked programs from the same round</legend>{eligible.map(p=><label className="connected-check" key={p.programId}><input type="checkbox" checked={selected.includes(p.programId)} onChange={e=>{setSelected(e.target.checked?[...selected,p.programId]:selected.filter(id=>id!==p.programId));setApplicants([]);setPreview(null);}}/>{p.rulebook!.programName} · {p.rulebook!.round}</label>)}</fieldset>{rules.length?<><button className="button button-secondary" disabled={busy||!!pending||applicants.length>=100} onClick={()=>{setApplicants([...applicants,{id:'',scores:{},curriculum:'Science–Mathematics',preferences:rules.map(r=>r.programId)}]);setPreview(null);}}>Add fictional applicant</button>{applicants.map((a,index)=><fieldset className="live-cohort" key={index} disabled={busy||!!pending}><legend>Applicant {index+1}</legend><Field label={`Student account ${index+1}`}><select aria-label={`Student account ${index+1}`} value={a.id} onChange={e=>update(index,{id:e.target.value})}><option value="">Choose a student</option>{students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.id}</option>)}</select></Field>{components.map(c=><Field key={c.scoreId} label={`${c.label} / ${c.maximum}`}><input type="number" min={0} max={c.maximum} step="any" value={a.scores[c.scoreId]??''} onChange={e=>update(index,{scores:{...a.scores,[c.scoreId]:Number(e.target.value)}})}/></Field>)}<Field label="Curriculum"><select value={a.curriculum} onChange={e=>update(index,{curriculum:e.target.value})}><option>Science–Mathematics</option><option>Arts–Languages</option></select></Field><div className="connected-preferences"><strong>Ranked preferences</strong>{a.preferences.map((id,rank)=><div key={id}><span>{rank+1}. {rules.find(r=>r.programId===id)?.programName}</span><button className="text-button" disabled={rank===0} onClick={()=>{const order=[...a.preferences];[order[rank-1],order[rank]]=[order[rank],order[rank-1]];update(index,{preferences:order});}}>Move up</button></div>)}</div><button className="text-button" onClick={()=>{setApplicants(applicants.filter((_,i)=>i!==index));setPreview(null);}}>Remove applicant</button></fieldset>)}<div className="live-actions"><button className="button button-secondary" disabled={busy||!!pending||!applicants.length} onClick={()=>void run(async()=>{const body=payload();if(body.applicants.some(a=>!a.id||a.scores.some(s=>!Number.isFinite(s.score))))throw new Error('Choose each student and complete every score.');if(new Set(body.applicants.map(a=>a.id)).size!==applicants.length)throw new Error('Each student can appear only once.');if(rules.some(r=>r.academicYear!==rules[0].academicYear||r.round!==rules[0].round))throw new Error('Choose programs from the same year and round.');setPreview(allocatePreview(rules,body.applicants));})}>Preview allocation</button>{preview&&!pending?<button className="button button-primary" disabled={busy} onClick={()=>{if(confirm('Record these fictional admission results on chain? This intake can be processed only once.'))void run(()=>process(payload()));}}>Process and record results</button>:null}{pending&&!completed?<button className="button button-primary" disabled={busy} onClick={()=>void run(()=>process(pending))}>Retry saved request</button>:null}</div></>:null}{preview?<div className="allocation-preview-result"><h3>Allocation preview</h3>{Object.entries(preview).map(([id,assigned])=><p key={id}>{students.find(s=>s.id===id)?.name??id}: {assigned?rules.find(r=>r.programId===assigned)?.programName:'Not admitted'}</p>)}<p className="fine-print">Local calculation. Score authenticity and allocation fairness are not independently verified.</p></div>:null}{error?<Alert>{error}</Alert>:null}{completed?<p role="status">Results are saved and recorded. Students can now sign in on another device.</p>:null}<details><summary>Saved processing runs</summary>{history.map(h=><p key={h.runId}>{h.runId} · {h.completedAt?'Completed':'Pending'}{!h.completedAt?<button className="text-button" disabled={busy} onClick={()=>void run(async()=>{const body=await api<Payload>(`/office/simulations/${h.runId}`,{token:session.token});await process(body);})}>Resume run</button>:null}</p>)}</details></section>;
}
function IssueWizard({session,programs,results,refresh}:{session:Session;programs:PublicProgram[];results:OfficeResult[];refresh:()=>Promise<void>}){
  const [programId,setProgramId]=useState(''),[step,setStep]=useState(0),[chosen,setChosen]=useState<string[]>([]),[done,setDone]=useState<string[]>([]);
  const {busy,error,run}=useRequest();const program=programs.find(p=>p.programId===programId);
  const ready=results.filter(r=>r.programId===programId&&r.outcome==='admitted'&&r.confirmationRequestedAt&&!r.credential);
  return <div className="connected-issuance"><div className="live-steps">{['Choose program','Import confirmed students','Review & issue'].map((label,i)=><button key={label} disabled={busy||i>step} className={i===step?'active':''} onClick={()=>setStep(i)}>{i+1}. {label}</button>)}</div>{step===0?<><Field label="Issuance program"><select value={programId} onChange={e=>{setProgramId(e.target.value);setChosen([]);setDone([]);}}><option value="">Choose a program</option>{programs.filter(p=>p.rulebook?.institutionId===session.institutionId).map(p=><option value={p.programId} key={p.programId}>{p.rulebook!.programName} · {p.rulebook!.round}</option>)}</select></Field><button className="button button-primary" disabled={!programId||busy} onClick={()=>setStep(1)}>Continue</button></>:step===1?<><h3>Confirmed students</h3><p>Only authenticated confirmations from saved admission results appear here.</p><button className="button button-secondary" disabled={busy} onClick={()=>void run(refresh)}>Refresh confirmations</button>{ready.map(r=><label className="connected-check" key={r.resultId}><input type="checkbox" checked={chosen.includes(r.resultId)} onChange={e=>setChosen(e.target.checked?[...chosen,r.resultId]:chosen.filter(id=>id!==r.resultId))}/>{r.studentId}</label>)}{!ready.length?<p>No confirmed students are ready for issuance.</p>:null}<button className="button button-primary" disabled={!chosen.length||busy} onClick={()=>setStep(2)}>Review & issue</button></>:<><h3>One last look.</h3><p>{program?.rulebook?.programName} · {chosen.length} selected</p><p>{program?.active} active rights / {program?.capacity} seats · {program?.issuanceAllowance} issuance allowance</p><p className="fine-print">The contract checks authorization, confirmation and capacity for every token.</p><button className="button button-primary" disabled={busy||!chosen.length||chosen.length>(program?.issuanceAllowance??0)||chosen.length>(program?program.capacity-program.active:0)} onClick={()=>{if(confirm(`Issue ${chosen.length} admission tokens on chain?`))void run(async()=>{try{for(const id of chosen){if(done.includes(id))continue;await api(`/issuer/results/${id}/issue`,{method:'POST',token:session.token});setDone(old=>[...old,id]);}setChosen([]);}finally{await refresh();}});}}>{busy?'Waiting for chain…':`Issue ${chosen.length} tokens`}</button>{done.length?<p role="status">{done.length} admission tokens issued.</p>:null}</>}{error?<Alert>{error}</Alert>:null}</div>;
}

function University() {
  const { session, save } = useSession("institution");
  const [tab,setTab]=useState<"rules"|"process"|"issue">("rules"),[editing,setEditing]=useState<AdmissionRulebook|null>(null),[editRevision,setEditRevision]=useState(0);
  const [drafts,setDrafts]=useState<{rule:AdmissionRulebook;revision:number}[]>([]);
  const [programs, setPrograms] = useState<PublicProgram[]>([]),
    [results, setResults] = useState<OfficeResult[]>([]),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const { busy, error, run } = useRequest();
  const refresh = async () => {
    try {
      const [p, r, workspace] = await Promise.all([
        api<PublicProgram[]>("/public/programs"),
        api<OfficeResult[]>("/office/results", { token: session!.token }),
        api<{drafts:{rule:AdmissionRulebook;revision:number}[]}>("/office/workspace",{token:session!.token}),
      ]);
      setPrograms(p);
      setResults(r);setDrafts(workspace.drafts);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) save(null);
      throw e;
    }
  };
  useEffect(() => {
    if (session) void run(refresh);
  }, [session]);
  if (!session) return <SignIn role="institution" onLogin={save} />;
  return (
    <>
      <Heading eyebrow={session.institutionId!} title="Set the rules. Make them checkable.">
        Build clear admission rules. Publish a shared reference.
      </Heading>
      <button
        className="button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await api("/auth/institution/logout", {
              method: "POST",
              token: session.token,
            });
            save(null);
          })
        }
      >
        Sign out
      </button>
      {error ? <Alert>{error}</Alert> : null}
      <nav className="connected-tabs" aria-label="University workspace">
        {([['rules','Program rulebooks'],['process','Process admissions'],['issue','Issue admission tokens']] as const).map(([id,label])=><button key={id} className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
      </nav>
      {tab==='rules'?(editing?<><button className="text-button" onClick={()=>{if(confirm('Leave this editor? Save your draft first to keep changes.'))setEditing(null);}}>← All rulebooks</button><RuleBuilder key={editing.id} initial={editing} initialRevision={editRevision} session={session} refresh={refresh}/></>:<>
        <div className="section-heading"><h2>Program rulebooks</h2><button className="button button-primary" onClick={()=>{setEditing({...defaultRule(),institutionId:session.institutionId!});setEditRevision(0);}}>Create rulebook <Icon name="plus" size={18}/></button></div>
        <div className="connected-rule-gallery">{programs.filter(p=>p.rulebook?.institutionId===session.institutionId).map(p=><article key={p.programId} className="connected-rule-card"><Badge tone="green">Published</Badge><h3>{p.rulebook!.programName}</h3><p>{p.academicYear} · {p.rulebook!.round}</p><dl className="detail-list"><div><dt>Capacity</dt><dd>{p.capacity} seats</dd></div><div><dt>Version</dt><dd>{p.rulebook!.version}</dd></div></dl><details><summary>View rulebook & history</summary><Json value={p.rulebook}/><ReceiptView value={p.lock}/><p>Published rules are immutable. A changed intake needs a new round.</p></details><button className="button button-secondary" onClick={()=>{setEditing({...p.rulebook!,id:`rule-${crypto.randomUUID()}`,version:p.rulebook!.version+1,round:'',status:'draft',createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null});setEditRevision(0);}}>Create new version</button></article>)}
        {drafts.filter(d=>!programs.some(p=>p.rulebook?.id===d.rule.id)).map(d=><article className="connected-rule-card" key={d.rule.id}><Badge>Draft</Badge><h3>{d.rule.programName}</h3><p>{d.rule.academicYear} · {d.rule.capacity} seats · v{d.rule.version}</p><button className="button button-secondary" onClick={()=>{setEditing(d.rule);setEditRevision(d.revision);}}>Edit rulebook</button></article>)}</div>
        {!programs.length&&!drafts.length?<div className="quiet-empty"><Icon name="file" size={28}/><h3>Start with one program.</h3><p>Create a rulebook, then set its scoring and eligibility rules.</p></div>:null}
      </>):null}
      {tab==='process'?<Simulation session={session} programs={programs} refresh={refresh}/>:null}
      {tab==='issue'?<section className="panel live-panel">
        <h2>Issue admission tokens.</h2><IssueWizard session={session} programs={programs} results={results} refresh={refresh}/><h3>Manage issued records</h3>
        <button
          className="button"
          disabled={busy}
          onClick={() => void run(refresh)}
        >
          Refresh confirmations
        </button>
        {receipt ? <ReceiptView value={receipt} /> : null}
        {results.length === 0 ? <p>No processed results yet.</p> : null}
        {results.map((record) => (
          <article className="live-result" key={record.resultId}>
            <h3>
              {record.studentId} · {record.outcome}
            </h3>
            <p>
              {record.credential
                ? `Right: ${record.credential.lifecycle}`
                : record.outcome === "not_admitted"
                  ? "Result only; no admission right"
                  : record.confirmationRequestedAt
                    ? "Confirmation requested"
                    : "Awaiting student confirmation"}
            </p>
            <p className="live-id">{record.resultId}</p>
            <div className="live-actions">
              {record.outcome === "admitted" &&
              record.confirmationRequestedAt &&
              !record.credential ? (
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if(!confirm("Issue this confirmed admission token on chain?"))return;
                      const response = await api<{ issuance: Receipt | null }>(
                        `/issuer/results/${record.resultId}/issue`,
                        { method: "POST", token: session.token },
                      );
                      setReceipt(response.issuance);
                      await refresh();
                    })
                  }
                >
                  {busy ? "Waiting for chain…" : "Issue admission right"}
                </button>
              ) : null}
              {record.credential ? (
                <>
                  <a
                    className="button"
                    href={`/verify/${record.credential.credentialId}`}
                  >
                    Public verification
                  </a>
                  {record.credential.lifecycle === "valid" ||
                  record.credential.lifecycle === "enrolled"
                    ? (["enrolled", "withdrawn", "revoked"] as const)
                        .filter(
                          (status) => status !== record.credential!.lifecycle,
                        )
                        .map((status) => (
                          <button
                            className="button"
                            key={status}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const reason = prompt(
                                  `Reason for ${status} (stored only as a hash on chain):`,
                                );
                                if (!reason?.trim()) return;
                                if(!confirm(`Set this credential to ${status}? Withdrawn and revoked rights cannot be restored.`))return;
                                const digest = await crypto.subtle.digest(
                                  "SHA-256",
                                  new TextEncoder().encode(reason),
                                );
                                const reasonCommitment =
                                  "0x" +
                                  Array.from(new Uint8Array(digest), (b) =>
                                    b.toString(16).padStart(2, "0"),
                                  ).join("");
                                const response = await api<{
                                  transaction: Receipt | null;
                                }>(
                                  `/issuer/credentials/${record.credential!.credentialId}/status`,
                                  {
                                    method: "POST",
                                    token: session.token,
                                    body: { status, reasonCommitment },
                                  },
                                );
                                setReceipt(response.transaction);
                                await refresh();
                              })
                            }
                          >
                            {status}
                          </button>
                        ))
                    : null}
                </>
              ) : null}
            </div>
            <ReceiptView value={record.issuance ?? record.publication} />
          </article>
        ))}
      </section>:null}
    </>
  );
}
export default function LiveApp() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  let page: PageId = "wallet",
    content = <StudentWallet />;
  if (path === "/university") {
    page = "university";
    content = <University />;
  } else if (path === "/transparency") {
    page = "transparency";
    content = <Transparency />;
  } else if (path === "/verify" || path.startsWith("/verify/")) {
    page = "verify";
    content = <Verify />;
  } else if (path !== "/" && path !== "/student/wallet")
    content = <Heading eyebrow="404" title="Page not found" />;
  return (
    <Layout page={page} live>
      {content}
    </Layout>
  );
}
