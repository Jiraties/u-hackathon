import {Icon} from '../components/Icon';
import {networkLabel, type World} from './state';

const shortHash=(value:string)=>`${value.slice(0,10)}…${value.slice(-6)}`;
const guarantees=[
 {title:'Rules become contract state.',onchain:'The registry stores the policy hash, subject weights, minimums and seat capacity. Locking before evaluation creates a tamper-evident reference: later changes can be detected by comparing them with the recorded version.',offchain:'The university chooses the policy. A published policy does not establish that it is appropriate or fair.',kind:'program'},
 {title:'Private inputs. Public verification.',onchain:'A Solidity verifier checks the Noir proof against the authorized exam root and locked program policy. The registry records the scoring claim.',offchain:'The examination authority authenticates the source records. Proof generation happens on the server; raw scores stay off-chain.',kind:'scoring'},
 {title:'A recorded result is not a seat.',onchain:'Each result has a recorded commitment. Issuance checks confirmation, an eligible scoring claim and the remaining contract capacity.',offchain:'The admissions authority runs matching and reports the outcome. The ZK circuit does not prove preferences, ranking or the full allocation.',kind:'result'},
 {title:'An admission right you can check.',onchain:'The registry records issuance and credential status. Admission rights are non-transferable, and public verification reads the registry.',offchain:'Students use a private account. Institutional signers pay gas; the student does not need MetaMask or AVAX. A token does not prove the holder’s identity.',kind:'credential'},
 {title:'Enforcement you can inspect.',onchain:'The contract rejects issuance without an eligible proof or when capacity is full. Inspect the recorded guard calls and their revert evidence.',offchain:'The score experiment runs a local Noir constraint check. The eligibility and capacity experiments use historical read-only contract calls; no new transaction is sent.',kind:'all'},
];

export const ChainOverview=({world,inspect}:{world:World;inspect:()=>void})=>{
 const claims=world.students.flatMap(s=>s.proof.scoring).filter(s=>s.status==='verified').length;
 const rights=world.students.flatMap(s=>s.wallet.records).filter(r=>r.credential).length;
 const current=world.state==='verified';
 return <section className="demo-chain-overview" aria-label="Web3 demo evidence" data-ui>
  <div className="demo-chain-heading"><Icon name="globe" size={25}/><div><h2>{networkLabel(world)}</h2><p>{world.network?`Chain ${world.network.chainId}${world.network.protocolVersion?` · Registry V${world.network.protocolVersion}`:''}`:'Awaiting network evidence'}</p></div><span className="demo-chain-mode">{world.mode==='fuji'?'Testnet':world.mode==='local'?'Local EVM':'Pending'}</span></div>
  <dl className="demo-chain-counts"><div><dt>Scoring claims</dt><dd>{world.manifest?claims:'—'}</dd></div><div><dt>Admission rights</dt><dd>{world.manifest?rights:'—'}</dd></div></dl>
  <p className="demo-chain-caption">{current?'Evidence checked against the registry':'Evidence snapshot · not currently verified'}</p>
  <div className="demo-chain-contract"><span>FairPassRegistryV2</span>{world.manifest?<code>{world.manifest.registry}</code>:<p>Contract evidence is not available yet.</p>}</div>
  <ol className="demo-chain-path"><li><Icon name="lock"/><span><strong>Commit the rules</strong><small>Versioned scoring policy + seat capacity</small></span></li><li><Icon name="shield"/><span><strong>Verify the ZK proof</strong><small>Noir → Solidity verifier → scoring claim</small></span></li><li><Icon name="graduation"/><span><strong>Issue the admission right</strong><small>Eligible + confirmed + capacity available</small></span></li></ol>
  <button className="demo-text-action" onClick={inspect}>Inspect contracts & receipts<Icon name="arrow" size={17}/></button>
 </section>;
};

export const ChapterEvidence=({world,chapter,inspect}:{world:World;chapter:number;inspect:()=>void})=>{
 const guarantee=guarantees[chapter];
 const entries=world.manifest?.evidence.filter(e=>guarantee.kind==='all'||e.kind===guarantee.kind||(chapter===1&&e.kind==='dataset'))??[];
 // A transaction can emit several events. Show distinct receipts in this compact view.
 const receipts=entries.filter((e,i)=>entries.findIndex(other=>other.receipt.transactionHash===e.receipt.transactionHash)===i).slice(0,3);
 return <section className="demo-contract-evidence" aria-label="Smart contract evidence" data-ui>
  <div className="demo-contract-explanation"><h2>{guarantee.title}</h2><dl><div><dt>On-chain</dt><dd>{guarantee.onchain}</dd></div><div><dt>Off-chain & trust</dt><dd>{guarantee.offchain}</dd></div></dl></div>
  <div className="demo-receipt-preview"><div className="demo-receipt-heading"><h3>Transaction evidence</h3><span>{world.state==='verified'?'Registry checked':'Not currently verified'}</span></div>
   {receipts.length?<ol>{receipts.map(e=><li key={e.receipt.transactionHash}><div><strong>{e.eventName??e.kind}</strong><span>Block {e.receipt.blockNumber}</span></div>{e.receipt.chainId===43113?<a href={`https://testnet.snowtrace.io/tx/${e.receipt.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`View ${e.eventName??e.kind} transaction on Fuji explorer`}><code>{shortHash(e.receipt.transactionHash)}</code><Icon name="external" size={13}/></a>:<code title={e.receipt.transactionHash}>{shortHash(e.receipt.transactionHash)}</code>}</li>)}</ol>:<p className="demo-receipt-empty">No transaction evidence is available for this step.</p>}
   <button className="demo-text-action" onClick={inspect}>Open full evidence<Icon name="arrow" size={15}/></button>
  </div>
 </section>;
};
