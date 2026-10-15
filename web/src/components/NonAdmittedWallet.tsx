import { useRef } from "react";
import type { Institution, PrivateAdmissionResult, ResultVerificationKind, StudentWallet } from "../domain/models";
import { calculateProgramScore, resultCheckState } from "../domain/admissionResults";
import { Icon, type IconName } from "./Icon";
import { Badge } from "./ui";

const checks: { kind: ResultVerificationKind; title: string; icon: IconName; meaning: string }[] = [
  { kind: "score_authenticity", title: "Score authenticity", icon: "chart", meaning: "Did the scores come from an authenticated exam provider?" },
  { kind: "result_integrity", title: "Result integrity", icon: "file", meaning: "Does this report match the version committed to the blockchain?" },
  { kind: "allocation_correctness", title: "Allocation correctness", icon: "university", meaning: "Was the allocation recomputed correctly using complete, authenticated inputs?" },
];

export const NonAdmittedWallet = ({ wallet, result, institutions }: {
  wallet: StudentWallet;
  result: PrivateAdmissionResult;
  institutions: readonly Institution[];
}) => {
  const explanation = useRef<HTMLDetailsElement>(null);
  const explanationTitle = useRef<HTMLHeadingElement>(null);
  const understand = () => {
    if (explanation.current) explanation.current.open = true;
    explanationTitle.current?.focus({ preventScroll: true });
    explanation.current?.scrollIntoView({ block: "start", behavior: "auto" });
  };
  const attestation = result.attestation;

  return <div className="wallet-page non-admitted-wallet">
    <div className="wallet-welcome"><span>Hi, {wallet.student.givenName}<span className="welcome-dot">.</span></span><span className="student-chip"><span className="avatar">{wallet.student.initials}</span>Demo student</span></div>
    <div className="wallet-heading"><h1>Your result. Clearly explained.</h1><p>Your result matters, whether or not you received an offer.</p></div>

    <div className="admission-result-layout">
      <section className="admission-result-card" aria-labelledby="admission-result-status">
        <div className="result-card-heading"><span className="admission-report-icon"><Icon name="file" size={27} /></span><span>Admission Result</span><Badge tone="blue">Fictional report</Badge></div>
        <p className="result-card-year">Academic year {attestation.academicYear}</p><h2 id="admission-result-status">Not admitted</h2><p className="result-card-round">{attestation.round}</p>
        <p className="result-card-description">No admission offer was recorded for your ranked programs in this sample round. You can still review your scores and the evidence behind the result.</p>
        <button className="button button-primary" type="button" onClick={understand}>Understand my result <Icon name="arrow" size={19} /></button>
        <div className="result-attestation-reference"><span>Result attestation <strong>{attestation.id}</strong></span><span>{attestation.reportedOn}</span></div>
        <p className="no-admission-right"><Icon name="info" size={16} />This is a result record, not an admission-right token. No seat is granted.</p>
      </section>

      <aside className="result-verification" aria-labelledby="result-verification-heading"><h2 id="result-verification-heading">Three different checks.</h2><p>A recorded result and a correct allocation are different claims.</p><div className="result-checks">{checks.map(check => {
        const record = result.verification[check.kind];
        const state = resultCheckState(check.kind, record);
        return <details className="result-check" key={check.kind}><summary><span className="result-check-icon"><Icon name={check.icon} size={20} /></span><span>{check.title}</span><Badge tone={state === "verified" ? "green" : "neutral"}>{state === "verified" ? "Verified" : state === "unavailable" ? "Not available" : "Not verified"}</Badge><Icon className="disclosure-chevron" name="down" size={15} /></summary><div className="result-check-explanation"><p>{check.meaning}</p><p>{record.explanation}</p>{state === "verified" && record.evidence ? <dl className="detail-list"><div><dt>Checked</dt><dd>{record.evidence.checkedAt}</dd></div><div><dt>Evidence</dt><dd className="technical-value">{record.evidence.reference}</dd></div></dl> : <p className="fine-print">No completed verification is claimed for this check.</p>}</div></details>;
      })}</div><p className="result-verification-note">All checks in this seeded example are unverified or unavailable. Recalculating a score does not authenticate it or prove an allocation was fair.</p></aside>
    </div>

    <details ref={explanation} className="result-explanation" id="result-explanation"><summary><h2 ref={explanationTitle} tabIndex={-1}>What does this result tell me?</h2><Icon className="disclosure-chevron" name="down" size={19} /></summary><div><p>The fictional admissions authority reported no admission for any of your choices. The program scores below help you see how the sample criteria use your subject scores.</p><p>There is no authenticated selection explanation, cutoff record, or complete applicant dataset attached. Scores alone cannot establish why another applicant received a place. Capacity, preferences, eligibility, tie rules, and other applicants can affect an allocation.</p><p>A result commitment could later help detect changes to this report. It would not, by itself, establish that the original scores or admission decision were correct.</p></div></details>

    <section className="ranked-results" aria-labelledby="ranked-results-title"><div className="section-heading"><div><h2 id="ranked-results-title">Your ranked programs</h2><p>Calculated for each program, using your fictional subject scores.</p></div><span className="private-record-label"><Icon name="lock" size={15} />Private account view</span></div><p className="criteria-demo-note">University names are illustrative. These weights and program outcomes are fictional, not official admission criteria.</p>
      <ol className="ranked-program-list">{[...result.rankedPrograms].sort((a, b) => a.rank - b.rank).map(choice => {
        const institution = institutions.find(item => item.id === choice.institutionId);
        const calculation = calculateProgramScore(wallet.scores, choice.criteria);
        return <li key={choice.id}><div className="ranked-program-top"><span className="preference-rank" aria-label={`Preference ${choice.rank}`}>{choice.rank}</span><div className="ranked-program-name"><h3>{choice.programName}</h3><p>{institution?.name ?? "Institution unavailable"}</p></div><div className="program-result-score"><span>Program score</span><strong>{calculation.status === "calculated" ? calculation.total.toFixed(2) : "Unavailable"}{calculation.status === "calculated" ? <small> / 100</small> : null}</strong></div></div><div className="ranked-program-bottom"><span>Not admitted · Reported demo outcome</span><span>Calculated locally, not independently verified</span></div>
          <details className="program-calculation"><summary>How this score was calculated <Icon className="disclosure-chevron" name="down" size={15} /></summary>{calculation.status === "calculated" ? <><div className="calculation-table-wrap"><table><caption className="sr-only">Fictional scoring formula for preference {choice.rank}</caption><thead><tr><th scope="col">Subject</th><th scope="col">Reported score</th><th scope="col">Weight</th><th scope="col">Contribution</th></tr></thead><tbody>{calculation.terms.map(term => <tr key={`${term.subject}-${term.label}`}><th scope="row">{term.subject}<small>{term.label}</small></th><td>{term.score.toFixed(2)} / {term.maximum}</td><td>{term.weightPercent}%</td><td>{term.contribution.toFixed(2)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>Calculated program score</th><td>{calculation.total.toFixed(2)} / 100</td></tr></tfoot></table></div><p>Each contribution = reported subject score ÷ subject maximum × program weight. The total is rounded to two decimals after summing unrounded contributions.</p></> : <p>{calculation.reason}</p>}</details>
        </li>;
      })}</ol>
    </section>

    <div className="result-evidence-layout"><section className="commitment-explainer"><span className="story-symbol"><Icon name="globe" size={25} /></span><h2>A sealed reference to your result.</h2><p>A blockchain commitment is like a sealed reference to one version of a report. An authorized verifier can compare the private report with that reference to check whether it changed.</p><details className="result-commitment-details"><summary>How commitments work <Icon className="disclosure-chevron" name="down" size={16} /></summary><p>The report is combined with a random secret before a cryptographic fingerprint is made. Only the opaque commitment would be published. A verifier needs the private report and its secret to recompute and compare it with the recorded commitment.</p><p>A match establishes consistency with that version. It does not establish the truth of the report, authenticate exam scores, or prove admission fairness.</p></details><details className="result-commitment-details"><summary>View result evidence <Icon className="disclosure-chevron" name="down" size={16} /></summary><dl className="detail-list"><div><dt>Report source</dt><dd>{attestation.issuerLabel} · Fixture</dd></div><div><dt>Issuer signature</dt><dd>Not provided</dd></div><div><dt>Commitment</dt><dd className="technical-value">{result.publicCommitment.value ?? "Not created or published"}</dd></div><div><dt>Contract</dt><dd className="technical-value">{result.publicCommitment.chainReference?.contractAddress ?? "Not connected"}</dd></div><div><dt>Transaction</dt><dd className="technical-value">{result.publicCommitment.chainReference?.transactionHash ?? "Not available"}</dd></div><div><dt>Allocation evidence</dt><dd>Not available</dd></div></dl><p>This result attestation is a fictional private report, not a signed or on-chain-verified record.</p></details></section>
      <aside className="result-privacy"><Icon name="lock" size={27} /><h2>Your result stays personal.</h2><p>Your name, individual scores, and ranked choices belong in your private account. They are not part of the public commitment.</p><p>This private report is not added to the public token verifier. No admission-right token is issued to an unsuccessful applicant.</p><span>Transparent evidence. Private student records.</span></aside>
    </div>
    <details className="score-drawer result-subject-scores"><summary><span className="score-drawer-icon"><Icon name="chart" size={22} /></span><span><strong>Your subject scores</strong><small>{wallet.scores.length} subjects · Fictional, unauthenticated records</small></span><Icon className="disclosure-chevron" name="down" size={18} /></summary><div className="score-subjects">{wallet.scores.map(score => <div key={score.id}><div><strong>{score.subject}</strong><span>{score.label}</span></div><p>{score.score.toFixed(2)}<small> / {score.maximum}</small></p></div>)}</div></details>
  </div>;
};
