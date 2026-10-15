import { useLayoutEffect, useRef, useState } from "react";
import type { Institution, PrivateAdmissionResult, RankedProgramResult, ResultVerificationKind, StudentWallet } from "../domain/models";
import { evaluateRulebook, ruleIsOnChain, type AdmissionRulebook } from "../domain/rulebooks";
import { proofStatuses, verificationProofStatus, type ProofStatus } from "../domain/proofJourney";
import { Icon } from "./Icon";
import { Badge, Notice } from "./ui";

const attestationSourceIsLive = (result: PrivateAdmissionResult) => result.attestation.source !== "fixture";

const checks: { kind: ResultVerificationKind; title: string; description: string }[] = [
  { kind: "score_authenticity", title: "Score authenticity", description: "An authorized exam issuer authenticated the scores." },
  { kind: "result_integrity", title: "Result integrity", description: "The private result matches authenticated on-chain evidence." },
  { kind: "allocation_correctness", title: "Allocation correctness", description: "The complete selection was independently recomputed." },
];
const ProofBadge = ({ status }: { status: ProofStatus }) => {
  const presentation = proofStatuses[status];
  return <Badge tone={presentation.tone}><Icon name={presentation.icon} size={13} />{presentation.label}</Badge>;
};
export const NonAdmittedWallet = ({ wallet, result, institutions, rulebooks }: {
  wallet: StudentWallet; result: PrivateAdmissionResult; institutions: readonly Institution[]; rulebooks: readonly AdmissionRulebook[];
}) => {
  // An explicit page class avoids document-wide :has() matching for the wallet layout.
  useLayoutEffect(() => {
    document.body.classList.add("non-admitted-view");
    return () => document.body.classList.remove("non-admitted-view");
  }, []);
  const choices = [...result.rankedPrograms].sort((a, b) => a.rank - b.rank);
  const [selectedId, setSelectedId] = useState(choices[0]?.id);
  const [proof, setProof] = useState<"scores" | "rules" | "calculation" | "eligibility" | "result">("result");
  const trace = useRef<HTMLElement>(null);
  const proofDialog = useRef<HTMLDialogElement>(null);
  const choice = choices.find(item => item.id === selectedId) ?? choices[0];
  const goTo = (section: HTMLElement | null) => { section?.focus({ preventScroll: true }); section?.scrollIntoView({ block: "start", behavior: "auto" }); };
  if (!choice) return <div className="non-admitted-wallet"><h1>Your result. Clearly explained.</h1><p>No program trace is available for this report.</p></div>;
  const rule = rulebooks.find(item => item.id === choice.rulebookId && item.version === choice.rulebookVersion && item.programId === choice.programId);
  if (!rule) return <div className="non-admitted-wallet"><h1>Your result. Clearly explained.</h1><p>The rulebook version for this historical result is unavailable. No replacement rules have been applied.</p></div>;
  const calculation = evaluateRulebook(rule, wallet.scores, wallet.qualifications);
  const eligibility = calculation.status === "calculated" ? calculation.eligible ? "met" : "not_met" : "unavailable";
  const ruleOnChain = ruleIsOnChain(rule);
  const ruleVersion = `v${rule.version}`;
  const ruleDate = new Date(rule.sealedAt ?? rule.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
  const institution = institutions.find(item => item.id === choice.institutionId);
  const openProof = (step: typeof proof) => { setProof(step); proofDialog.current?.showModal(); };
  const openTrace = () => goTo(trace.current);
  const resultOnChain = verificationProofStatus("result_integrity", result.verification.result_integrity) === "verified"
    && attestationSourceIsLive(result) && !!result.publicCommitment.value && !!result.publicCommitment.chainReference;
  const evidenceButton = (step: typeof proof) => {
    const onChain = step === "result" ? resultOnChain : step === "rules" && ruleOnChain;
    const contractRules = step === "rules" || step === "eligibility";
    const label = onChain ? "On-chain" : ({ rules: "Smart contract rules", scores: "Score record", calculation: "Calculation", eligibility: "Contract criteria", result: "Result record" })[step];
    return <button type="button" className={`evidence-badge${contractRules ? " contract-rules" : ""}${onChain ? " on-chain" : ""}`} onClick={() => openProof(step)} aria-label={`View ${step} Web3 proof`}><span className="evidence-badge-symbol"><Icon name={onChain || contractRules ? "check" : "file"} size={12} /></span>{label}<Icon name="chevron" size={12} /></button>;
  };
  const choose = (item: RankedProgramResult) => setSelectedId(item.id);
  const attestation = result.attestation;

  return <div className="wallet-page non-admitted-wallet">
    {attestation.previewRunId ? <div className="student-run-context"><Notice>Local admissions preview · Fictional inputs and allocation. This result references the exact rulebook versions used in run {attestation.previewRunId.slice(0,8)}.</Notice></div> : null}
    <div className="wallet-welcome"><span>Hi, {wallet.student.givenName}<span className="welcome-dot">.</span></span><span className="student-chip"><span className="avatar">{wallet.student.initials}</span>Demo student</span></div>
    <div className="wallet-heading"><h1>Your result. Clearly explained.</h1><p>Your admission result, program scores and supporting evidence in one place.</p></div>

    <div className="result-overview">
      <section className="admission-result-card" aria-labelledby="admission-result-status">
        <div className="result-card-heading"><Icon name="file" size={23} /><span>Admission Result</span><Badge tone="blue">Fictional report</Badge></div>
        <p className="result-card-year">Academic year {attestation.academicYear}</p><h2 id="admission-result-status">Not admitted</h2><p className="result-card-round">{attestation.round}</p>
        <button type="button" className="button button-primary" onClick={openTrace}>See why <Icon name="arrow" size={18} /></button>
        <div className="result-card-foot"><span>{attestation.id}</span><span>No admission right issued</span></div>
      </section>
      <aside className="result-roadmap" aria-label="Result timeline"><h2>Your result record</h2><p>The records behind this round.</p><ol>
        <li><span className="roadmap-node"><Icon name="lock" size={19} /></span><span><strong>Program rules</strong><small>{ruleDate} · {ruleVersion}</small></span>{evidenceButton("rules")}</li>
        <li><span className="roadmap-node"><Icon name="chart" size={19} /></span><span><strong>Program score calculated</strong><small>{calculation.status === "calculated" ? calculation.total.toFixed(2) + " / 100" : "Unavailable"} · {institution?.abbreviation}</small></span>{evidenceButton("calculation")}</li>
        <li><span className="roadmap-node"><Icon name="file" size={19} /></span><span><strong>Admission result recorded</strong><small>{attestation.reportedOn} · Not admitted</small></span>{evidenceButton("result")}</li>
      </ol></aside>
    </div>

    <section ref={trace} tabIndex={-1} className="proof-section trace-section" aria-labelledby="trace-heading"><div className="section-heading"><div><h2 id="trace-heading">Follow your result</h2><p>Three choices. A different calculation for each.</p></div><span className="trace-source">Illustrative Thai programs · Fictional rules</span></div>
      <div className="trace-layout"><div className="program-choices" role="group" aria-label="Choose a ranked program">{choices.map(item => {
        const pinned = rulebooks.find(book => book.id === item.rulebookId && book.version === item.rulebookVersion && book.programId === item.programId);
        const score = pinned ? evaluateRulebook(pinned, wallet.scores, wallet.qualifications) : {status:"unavailable" as const};
        return <button key={item.id} type="button" className={`program-choice${item.id === choice.id ? " selected" : ""}`} aria-pressed={item.id === choice.id} aria-controls="selected-program-trace" onClick={() => choose(item)}><span className="choice-top"><span className="preference-rank">{item.rank}</span><span>{institutions.find(university => university.id === item.institutionId)?.name ?? "Institution unavailable"}</span><Icon name="chevron" size={17} /></span><strong>{item.programName}</strong><span className="choice-score">{score.status === "calculated" ? score.total.toFixed(2) : "—"}<small> / 100</small></span><span className="choice-bottom"><span>Not admitted</span><span>{score.status === "calculated" ? "Trace available" : "Trace incomplete"}</span></span></button>;
      })}</div>
      <div className="selected-trace" id="selected-program-trace"><div className="trace-heading"><div><span>Preference {choice.rank} · {institution?.abbreviation}</span><h3>{choice.programName}</h3></div><span className="private-record-label"><Icon name="lock" size={13} />Private record</span></div>
        <div className="calculation-trace" id="calculation-trace" key={choice.id}>
          {calculation.status === "calculated" ? <>
            <div className="trace-node"><span className="trace-node-dot">1</span><div><div className="trace-node-heading"><h4>Your exam scores</h4>{evidenceButton("scores")}</div><span className="trace-support">Fictional inputs · Issuer not authenticated</span><div className="score-inputs">{calculation.terms.map((term, i) => <div key={i}><span>{term.subject === "A-Level" ? term.label : term.subject}</span><strong>{term.score}<small> / {term.maximum}</small></strong></div>)}</div></div></div>
            <div className="trace-node"><span className="trace-node-dot">2</span><div><div className="trace-node-heading"><h4>Program scoring rules</h4>{evidenceButton("rules")}</div><span className="trace-support">{ruleVersion} · Smart contract preview</span><div className="formula-terms">{calculation.terms.map((term, i) => <div key={i}><span>{term.subject === "A-Level" ? term.label : term.subject} × {term.weightPercent}%</span><strong>{term.contribution.toFixed(2)}</strong></div>)}</div><p className="trace-math-note">Each input is divided by its maximum, then multiplied by its weight. Add unrounded contributions; round the total to two decimals.</p></div></div>
            <div className="trace-node"><span className="trace-node-dot">3</span><div><div className="trace-node-heading"><h4>Calculated from your scores</h4>{evidenceButton("calculation")}</div><strong className="trace-total">{calculation.total.toFixed(2)}<small> / 100</small></strong><span className="trace-support">Recalculated locally · Not issuer authentication</span></div></div>
          </> : <p>{calculation.reason}</p>}
          <div className="trace-node"><span className="trace-node-dot">4</span><div><div className="trace-node-heading"><h4>Eligibility in this example</h4>{evidenceButton("eligibility")}</div><strong className="eligibility-label">{eligibility === "met" ? "Meets sample minimums" : eligibility === "not_met" ? "Below a sample minimum" : "Requirements unavailable"}</strong><div className="eligibility-rules">{rule.components.filter(c => c.minimumPercent !== null).map(component => <span key={component.scoreId}>{component.label} ≥ {component.minimumPercent}%</span>)}{rule.qualifications.map(q=><span key={q.field}>Curriculum: {q.equals}</span>)}</div><span className="trace-support">Local threshold check · Eligibility does not guarantee a seat</span></div></div>
          <div className="trace-node trace-outcome"><span className="trace-node-dot"><Icon name="file" size={16} /></span><div><div className="trace-node-heading"><h4>Reported admission outcome</h4>{evidenceButton("result")}</div><strong>Not admitted</strong><span className="trace-support">Fictional report · {attestation.reportedOn}</span><p>The score explains the calculation, not why you missed a seat. Other applicants, preferences, capacity and tie rules can affect selection.</p></div></div>
        </div>
      </div></div>
      <div className="allocation-note"><Icon name="info" size={20} /><p><strong>About this outcome</strong>These scores show how each program’s formula was applied. An independent allocation check also needs the full applicant dataset, preferences, capacity and selection rules.</p></div>
    </section>

    <div className="proof-bottom"><span><Icon name="lock" size={21} /><strong>Your result stays personal.</strong></span><p>Names, scores and ranked choices stay out of public blockchain records. This preview uses fictional data; no personal records are published.</p></div>
    <dialog ref={proofDialog} className="rule-proof-dialog" aria-labelledby="web3-proof-title">
      <div className="rule-dialog-top"><span className="proof-modal-symbol"><Icon name="shield" size={25} />Web3 evidence</span><button className="button button-secondary" type="button" onClick={() => proofDialog.current?.close()}>Close</button></div>
      <h2 id="web3-proof-title">{({ scores: "Exam score evidence", rules: "Smart contract rules", calculation: "Score calculation evidence", eligibility: "Eligibility evidence", result: "Admission result evidence" })[proof]}</h2>
      <p>{institution?.name} · {choice.programName}</p>
      <Badge tone={(proof === "result" && resultOnChain) || (proof === "rules" && ruleOnChain) ? "green" : "blue"}><Icon name={(proof === "result" && resultOnChain) || (proof === "rules" && ruleOnChain) ? "check" : "info"} size={14} />{proof === "result" && resultOnChain ? "On-chain · Result integrity verified" : proof === "rules" && ruleOnChain ? "On-chain · Rule integrity verified" : "Demo evidence · No on-chain verification"}</Badge>
      {proof === "rules" && <aside className="smart-contract-explainer" aria-labelledby="smart-contract-explainer-title"><span className="contract-explainer-icon"><Icon name="file" size={22} /></span><div><h3 id="smart-contract-explainer-title">A shared rulebook, written in code.</h3><p>A smart contract is a small program stored on a blockchain. FairPass is designed to read the program’s scoring weights from it, so you can check exactly which rules were used.</p><span className="contract-explainer-example"><Icon name="lock" size={13} />Scoring weights · Rule version · Program capacity</span></div></aside>}
      <dl>
        <div><dt>Record</dt><dd>{proof === "result" ? attestation.id : proof === "rules" ? rule.id : `${choice.id} / ${proof}`}</dd></div>
        <div><dt>Source</dt><dd>{proof === "result" ? attestation.issuerLabel : "Fictional admissions fixture"}</dd></div>
        {proof === "rules" && <><div><dt>Rule version</dt><dd>{ruleVersion}</dd></div><div><dt>{ruleOnChain ? "Published" : "Local version date"}</dt><dd>{rule.publication?.publishedAt ?? ruleDate}</dd></div><div><dt>Sample capacity</dt><dd>{rule.capacity} seats</dd></div><div><dt>Formula</dt><dd>{rule.components.map(term => `${term.label} × ${term.weightPercent}%`).join(" + ")}</dd></div></>}
        {proof === "scores" && wallet.scores.map(score => <div key={score.id}><dt>{score.label}</dt><dd>{score.score} / {score.maximum} · Fictional exam record</dd></div>)}
        {proof === "calculation" && <><div><dt>Calculated score</dt><dd>{calculation.status === "calculated" ? calculation.total.toFixed(2) + " / 100" : "Unavailable"}</dd></div><div><dt>Rule version</dt><dd>{ruleVersion}</dd></div><div><dt>Calculation source</dt><dd>Recalculated in this browser from the displayed subject inputs and weights.</dd></div></>}
        {proof === "eligibility" && <><div><dt>Threshold check</dt><dd>{eligibility === "met" ? "Meets sample minimums" : eligibility === "not_met" ? "Below a sample minimum" : "Unavailable"}</dd></div><div><dt>Requirements</dt><dd>{rule.components.filter(c => c.minimumPercent !== null).map(c => `${c.label} ≥ ${c.minimumPercent}%`).join(" · ")}</dd></div></>}
        {(proof === "rules" || proof === "result") ? <>
          <div><dt>Network</dt><dd>Avalanche · {proof === "rules" && ruleOnChain ? "Fuji · Chain 43113" : proof === "result" && resultOnChain ? `Chain ${result.publicCommitment.chainReference?.chainId}` : "Not connected"}</dd></div>
          <div><dt>Commitment</dt><dd>{(proof === "rules" ? rule.commitment : result.publicCommitment.value) ?? "Not published"}</dd></div>
          <div><dt>Contract</dt><dd>{(proof === "rules" ? rule : result.publicCommitment).chainReference?.contractAddress ?? "Not available"}</dd></div>
          <div><dt>Transaction</dt><dd>{(proof === "rules" ? rule : result.publicCommitment).chainReference?.transactionHash ?? "Not available"}</dd></div>
          <div><dt>Block</dt><dd>{(proof === "rules" ? rule : result.publicCommitment).chainReference?.blockNumber ?? "Not available"}</dd></div>
        </> : <div><dt>On-chain record</dt><dd>No separate on-chain proof is attached to this step.</dd></div>}
      </dl>
      <div className="modal-verification-checks">{checks.filter(check => proof === "result" || (proof === "scores" ? check.kind === "score_authenticity" : check.kind === "allocation_correctness")).map(check => <div key={check.kind}><strong>{check.title}</strong><ProofBadge status={verificationProofStatus(check.kind, result.verification[check.kind])} /><p>{result.verification[check.kind].explanation}</p></div>)}</div>
      <p>{proof === "rules" ? "This preview shows the scoring weights intended to be read from the program’s smart contract. The current data is fictional; no deployed contract or authenticated rule timestamp is connected." : proof === "result" ? "Result integrity concerns the recorded version. It does not independently establish score authenticity or allocation correctness. This result record grants no admission right." : "This step uses the displayed fictional inputs. A local calculation does not authenticate those inputs or verify the complete admissions allocation."}</p>
    </dialog>
  </div>;
};
