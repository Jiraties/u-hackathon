import { useState } from "react";
import type { FairPassViewData } from "../domain/models";
import { Icon } from "../components/Icon";
import { Badge, Notice, PageHeading } from "../components/ui";

export const IssuanceConsole = ({ data }: { data: FairPassViewData }) => {
  const [programId, setProgramId] = useState(data.programs[0].id);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const program = data.programs.find(item => item.id === programId)!;
  const records = data.issuanceRecords.filter(record => record.programId === program.id && record.status === "ready");
  const institution = data.institutions.find(item => item.id === program.institutionId)!;
  const projected = program.activeCredentials + records.length;
  const withinCapacity = projected <= program.capacity;
  const steps = ["Choose program", "Import students", "Review & issue"];
  return <div className="focused-page university-page">
    <div className="page-context"><Icon name="university" size={18} />For universities <span>Demo workspace</span></div>
    <PageHeading title="Issue admission tokens." description="Turn confirmed admissions into tokens students can independently verify." />
    <div className="issuer-strip"><span className="issuer-avatar">{institution.abbreviation}</span><div><strong>{institution.name}</strong><span>Sample institution · No authorized signer connected</span></div><Badge tone="blue">Academic year {program.academicYear}</Badge></div>
    <ol className="issuance-steps" aria-label="Issuance progress">{steps.map((step, index) => <li key={step} className={`${stage === index ? "current" : ""}${stage > index ? " complete" : ""}`} aria-current={stage === index ? "step" : undefined}><span>{stage > index ? <Icon name="check" size={17} /> : index + 1}</span>{step}</li>)}</ol>
    <div className="issuance-layout">
      <section className="issuance-workspace">
        {stage === 0 ? <><h2>Which program is this for?</h2><p>Each program uses the capacity from its selected rulebook.</p><label className="field-label" htmlFor="issuance-program">Program</label><select id="issuance-program" value={programId} onChange={event => setProgramId(event.target.value)}>{data.programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="program-summary"><Icon name="graduation" size={25} /><div><strong>{program.degree}</strong><span>{institution.name} · {program.academicYear}</span></div></div><button className="button button-primary" type="button" onClick={() => setStage(1)}>Continue <Icon name="arrow" size={18} /></button></> : null}
        {stage === 1 ? <><h2>Bring in confirmed students.</h2><p>Use confirmation records from an authorized admissions source. FairPass does not choose applicants.</p><div className="import-area"><span className="import-symbol"><Icon name="file" size={30} /></span><h3>{records.length ? `${records.length} sample confirmations available` : "No sample confirmations for this program"}</h3><p>This preview loads fictional records from the demo dataset. It does not connect to TCAS or import a real student file.</p><button className="button button-primary" type="button" disabled={!records.length} onClick={() => setStage(2)}>Load demo confirmations <Icon name="arrow" size={18} /></button></div><button className="text-button" type="button" onClick={() => setStage(0)}>Back to programs</button></> : null}
        {stage === 2 ? <><div className="review-heading"><div><h2>One last look.</h2><p>Review the confirmed records before issuance.</p></div><Badge tone={withinCapacity ? "green" : "amber"}>{withinCapacity ? "Within capacity" : "Exceeds capacity"}</Badge></div><ul className="student-review-list">{records.map(record => <li key={record.id}><span className="student-record-mark"><Icon name="check" size={17} /></span><div><strong>{record.applicantReference}</strong><span>{record.id} · Confirmed {record.confirmedOn}</span></div><Badge>Demo</Badge></li>)}</ul><div className="review-total"><span>Active rights after issuance</span><strong>{projected}<span> / {program.capacity}</span></strong></div>{!withinCapacity ? <Notice>The proposed active count exceeds the registered limit. Issuance must be rejected.</Notice> : null}<button className="button button-primary full-width" type="button" disabled>Issue {records.length} tokens <Icon name="lock" size={18} /></button><p className="fine-print">Issuance needs an authorized university signer and a deployed contract. No tokens are created in this preview. Capacity here is a local rulebook preview, not a live registry read.</p><button className="text-button" type="button" onClick={() => setStage(1)}>Back to confirmations</button></> : null}
      </section>
      <aside className="capacity-aside"><span className="capacity-aside-icon"><Icon name="university" size={25} /></span><h2>A limit that means something.</h2><p>This preview uses the same program capacity as the rulebook. Live issuance must check the registry contract’s authoritative state.</p><div className="capacity-mini-count"><strong>{program.activeCredentials}</strong><span>of {program.capacity} active rights</span></div><div className="capacity-meter" role="img" aria-label={`${program.activeCredentials} active rights out of ${program.capacity}`}><span style={{ width: `${Math.min(program.activeCredentials / program.capacity * 100, 100)}%` }} /></div><dl><div><dt>Rulebook capacity</dt><dd>{program.capacity}</dd></div><div><dt>Active rights</dt><dd>{program.activeCredentials}</dd></div><div><dt>Unoccupied capacity</dt><dd>{program.capacity - program.activeCredentials}</dd></div></dl><p className="fine-print">Sample counts. Contract enforcement is not connected. A vacancy does not automatically authorize a new offer.</p><a className="text-link" href={`/transparency?program=${encodeURIComponent(program.id)}`}>View public capacity <Icon name="arrow" size={16} /></a></aside>
    </div>
  </div>;
};

