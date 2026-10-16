import { replaceRoute } from "../router";
import { useState, type FormEvent } from "react";
import type { FairPassViewData } from "../domain/models";
import { Icon } from "../components/Icon";
import { Badge } from "../components/ui";
import { BlockchainDetails } from "../components/BlockchainDetails";
import { VerificationGuide } from "../components/VerificationGuide";
import { checkDemoCredential, normalizeCredentialCode } from "../services/demoVerification";

const resultCopy = {
  valid: { title: "Valid in this demo.", description: "This sample token is active and has not been withdrawn or revoked in the demo records.", icon: "check" },
  withdrawn: { title: "This token was withdrawn.", description: "The sample admission right is no longer active. Its history remains part of the record.", icon: "activity" },
  revoked: { title: "This token was revoked.", description: "The sample issuer revoked this credential. It should not be accepted as an active admission right.", icon: "info" },
  not_found: { title: "No demo token found.", description: "We could not find this code in the local sample records. No live registry has been searched.", icon: "search" },
  unavailable: { title: "Unable to verify.", description: "This example demonstrates an unavailable verification service. An unavailable check does not mean a credential is invalid.", icon: "globe" },
} as const;

export const VerificationPage = ({ data, credentialId }: { data: FairPassViewData; credentialId?: string }) => {
  const initialCode = normalizeCredentialCode(credentialId ?? "");
  const [input, setInput] = useState(initialCode);
  const [checkedCode, setCheckedCode] = useState(initialCode);
  const [error, setError] = useState("");
  const result = checkedCode ? checkDemoCredential(checkedCode, data.verificationCredentials) : null;
  const credential = result && "credential" in result ? result.credential : undefined;
  const program = data.programs.find(item => item.id === credential?.programId);
  const institution = data.institutions.find(item => item.id === credential?.institutionId);
  const check = (code: string) => {
    const normalized = normalizeCredentialCode(code);
    if (!normalized) { setError("Enter a token code or a FairPass verification link."); return; }
    setError(""); setInput(normalized); setCheckedCode(normalized);
    replaceRoute(`/verify/${encodeURIComponent(normalized)}`);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); check(input); };
  const examples = [
    { label: "Valid", code: data.admissionCredential.id },
    ...data.verificationCredentials.filter(item => item.status !== "active").map(item => ({ label: item.status === "withdrawn" ? "Withdrawn" : "Revoked", code: item.id })),
    { label: "Not found", code: "FP-NOT-FOUND" }, { label: "Unable to verify", code: "FP-DEMO-OFFLINE" },
  ];
  return <div className="verify-page">
    <div className="verify-intro"><span className="verify-symbol"><Icon name="shield" size={31} /></span><h1>A token. A clear answer.</h1><p>Check who issued it, and whether it is still active.</p></div>
    <form className="verification-form" onSubmit={submit}><label className="field-label" htmlFor="token-code">Token code or verification link</label><div className="verification-input-row"><input id="token-code" autoComplete="off" spellCheck={false} value={input} onChange={event => setInput(event.target.value)} placeholder="e.g. FP-2027-00842" aria-invalid={Boolean(error)} aria-describedby={error ? "verification-error" : "verification-demo-note"} /><button className="button button-primary" type="submit">Verify token <Icon name="arrow" size={19} /></button></div>{error ? <p id="verification-error" className="form-error" role="alert">{error}</p> : null}<div className="verifier-source"><span id="verification-demo-note"><span className="demo-dot" />Demo verifier · No live blockchain connection</span><button type="button" className="scan-button" disabled title="Camera scanning is not implemented in this frontend preview"><Icon name="search" size={16} />Scan QR · Coming later</button></div></form>
    <details className="verification-examples"><summary>Try a demo result</summary><div>{examples.map(example => <button className="example-chip" key={example.code} type="button" onClick={() => check(example.code)}>{example.label}</button>)}</div><p>These examples only look up fictional records in this browser.</p></details>
    {result ? <section className={`verification-result result-${result.kind}`} aria-live="polite" aria-atomic="true"><div className="result-top"><span className="result-symbol"><Icon name={resultCopy[result.kind].icon} size={28} /></span><Badge>Demonstration result</Badge></div><h2>{resultCopy[result.kind].title}</h2><p className="result-description">{resultCopy[result.kind].description}</p>{credential && institution && program ? <><div className="verified-record"><span className="issuer-avatar">{institution.abbreviation}</span><div><h3>{institution.name}</h3><p>{program.name}</p><span>Admission token · Academic year {program.academicYear}</span></div></div><dl className="detail-list"><div><dt>Token ID</dt><dd>{credential.id}</dd></div><div><dt>Issuer</dt><dd>University example, not authenticated</dd></div><div><dt>Blockchain check</dt><dd>Not performed</dd></div></dl></> : <p className="checked-code">Code checked: <strong>{checkedCode}</strong></p>}<p className="result-honesty"><Icon name="info" size={17} />This is simulated. No contract or authorized issuer has been independently verified.</p><BlockchainDetails credential={credential} />{program ? <a className="text-link" href={`/transparency?program=${encodeURIComponent(program.id)}`}>See this program’s public capacity <Icon name="arrow" size={17} /></a> : <button className="text-button" type="button" onClick={() => check(data.admissionCredential.id)}>Try the sample token</button>}</section> : <div className="verification-empty"><Icon name="file" size={28} /><p>A university-issued token can be checked without a student’s name or exam scores.</p><button className="text-button" type="button" onClick={() => check(data.admissionCredential.id)}>Try a sample token <Icon name="arrow" size={16} /></button></div>}
    <VerificationGuide /><p className="verifier-identity"><Icon name="lock" size={16} />A valid record does not establish the presenter’s identity. Confirm identity through an authorized process.</p>
  </div>;
};
export default VerificationPage;
