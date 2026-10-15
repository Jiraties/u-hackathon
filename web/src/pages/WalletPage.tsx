import { useId, useRef, useState } from "react";
import type { FairPassViewData } from "../domain/models";
import { Icon } from "../components/Icon";
import { Badge, Notice } from "../components/ui";
import { TokenCard } from "../components/TokenCard";
import { VerificationGuide } from "../components/VerificationGuide";
import { BlockchainDetails } from "../components/BlockchainDetails";
import { NonAdmittedWallet } from "../components/NonAdmittedWallet";
import { walletCanShowAdmissionToken } from "../domain/admissionResults";
import { ShareTokenButton } from "../components/ShareTokenButton";

const AdmittedWallet = ({ data }: { data: FairPassViewData }) => {
  const { wallet, institutions, programs } = data;
  const [beforeAdmission, setBeforeAdmission] = useState(false);
  const tokenDialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const credential = beforeAdmission || !walletCanShowAdmissionToken(wallet) ? undefined : wallet.credentials[0];
  const program = programs.find(item => item.id === credential?.programId);
  const institution = institutions.find(item => item.id === credential?.institutionId);
  const hasToken = Boolean(credential && program && institution);
  const scores = <div className="score-subjects">{wallet.scores.map(score => <div key={score.id}><div><strong>{score.subject}</strong><span>{score.label}</span></div><p>{score.score.toFixed(2)}<small> / {score.maximum}</small></p></div>)}</div>;

  return <div className="wallet-page">
    <div className="wallet-welcome"><span>Hi, {wallet.student.givenName}<span className="welcome-dot">.</span></span><span className="student-chip"><span className="avatar">{wallet.student.initials}</span>Demo student</span></div>
    <div className="wallet-heading"><h1>{hasToken ? "Your admission. Now a token." : "Your next chapter starts here."}</h1><p>{hasToken ? "Issued by your university. Ready to be checked. No crypto wallet needed." : "Keep your exam records together while you get ready for university."}</p></div>
    {credential && program && institution ? <div className="wallet-hero">
      <section className="wallet-pass-section" aria-label="Your sample admission token">
        <div className="pass-stack"><TokenCard credential={credential} institution={institution} program={program} /></div>
        <div className="token-actions"><button className="button button-primary" type="button" onClick={() => tokenDialog.current?.showModal()}>View token <Icon name="arrow" size={19} /></button><a href={`/verify/${credential.id}`} className="button button-secondary"><Icon name="shield" size={19} />Verify</a><ShareTokenButton credentialId={credential.id} /></div>
        <p className="wallet-pass-note"><Icon name="lock" size={14} />Non-transferable. An academic record, not a financial asset.</p>
      </section>
      <aside className="wallet-story"><span className="story-symbol"><Icon name="graduation" size={28} /></span><h2>A university-issued token.<br />A record you can share.</h2><p>Your admission token brings the university, program, and current status into one checkable record.</p><p className="story-small">This sample uses Kasetsart University. Live issuer authentication and Avalanche verification are not connected yet.</p><VerificationGuide /><div className="quiet-privacy"><Icon name="lock" size={20} /><p>Your name and scores stay in your private account. The public record uses an opaque token ID.</p></div></aside>
    </div> : <div className="before-admission"><section className="score-primary"><span className="score-record-icon"><Icon name="chart" size={32} /></span><div className="section-heading"><h2>Your entrance exam records</h2><Badge tone="blue">Demo scores</Badge></div>{scores}<p className="fine-print">Fictional subject scores, not independently authenticated. Programs apply their own scoring formulas.</p></section><aside className="before-admission-note"><h2>One step at a time.</h2><p>Your admission token will appear here after an authenticated confirmation and university issuance. An offer alone is not an issued token.</p><VerificationGuide /></aside></div>}
    <div className="wallet-below">
      {hasToken ? <details className="score-drawer"><summary><span className="score-drawer-icon"><Icon name="chart" size={22} /></span><span><strong>Entrance exam records</strong><small>{wallet.scores.length} subjects · Fictional demo scores</small></span><Icon className="disclosure-chevron" name="down" size={18} /></summary>{scores}<p className="fine-print">These sample scores are not independently authenticated or verified on-chain.</p></details> : <Notice>Your FairPass wallet is an academic credential vault. You do not need MetaMask, AVAX, or a crypto wallet to view it.</Notice>}
      <details className="demo-controls"><summary>Demo preview options</summary><label><input type="checkbox" checked={beforeAdmission} onChange={event => setBeforeAdmission(event.target.checked)} />Show the wallet before admission</label><p>This changes the local preview only.</p></details>
    </div>
    {credential && program && institution ? <dialog ref={tokenDialog} className="token-dialog" aria-labelledby={dialogTitle}><form method="dialog" className="dialog-close"><button className="close-button" aria-label="Close token details">×</button></form><h2 id={dialogTitle}>Your admission token</h2><p className="dialog-intro">A sample university-issued credential.</p><TokenCard compact credential={credential} institution={institution} program={program} /><dl className="detail-list"><div><dt>Issue date</dt><dd>{credential.issuedOn}</dd></div><div><dt>Credential type</dt><dd>Confirmed admission</dd></div><div><dt>Transferable</dt><dd>No</dd></div></dl><BlockchainDetails credential={credential} /><a href={`/verify/${credential.id}`} className="button button-primary full-width">Verify this token <Icon name="arrow" size={18} /></a></dialog> : null}
  </div>;
};
export const WalletPage = ({ data }: { data: FairPassViewData }) => {
  const [selectedId, setSelectedId] = useState(() => {
    const nonAdmitted = data.demoWallets.find(item => item.admission.status === "not_admitted");
    return new URLSearchParams(window.location.search).get("demo") === "not-admitted" && nonAdmitted ? nonAdmitted.student.id : data.wallet.student.id;
  });
  const wallet = data.demoWallets.find(item => item.student.id === selectedId) ?? data.wallet;
  return <>
    {wallet.admission.status === "not_admitted" ? <NonAdmittedWallet key={wallet.student.id} wallet={wallet} result={wallet.admission.result} institutions={data.institutions} rulebooks={data.rulebooks} /> : <AdmittedWallet key={wallet.student.id} data={{ ...data, wallet }} />}
    <section className="demo-student-switcher" aria-label="Demo student selection"><div><strong>Explore another applicant’s experience</strong><p>Fictional accounts. Switching changes this local preview only.</p></div><label><span className="sr-only">Demo student</span><select value={wallet.student.id} onChange={event => {
      setSelectedId(event.target.value);
      const next = data.demoWallets.find(item => item.student.id === event.target.value);
      const url = new URL(window.location.href);
      if (next?.admission.status === "not_admitted") url.searchParams.set("demo", "not-admitted");
      else url.searchParams.delete("demo");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }}>{data.demoWallets.map(item => <option key={item.student.id} value={item.student.id}>{item.student.givenName} · {item.admission.status === "not_admitted" ? "Not admitted" : "Admitted"}</option>)}</select></label></section>
  </>;
};
export default WalletPage;
