import type { AdmissionRulebook } from "../domain/rulebooks";
import { Icon } from "./Icon";
import { RuleWeightComposition } from "./RuleEditors";

export const RulePublicationReview = ({ rule, fingerprint }: { rule: AdmissionRulebook; fingerprint: string }) => {
  const minimums = rule.components.filter(component => component.minimumPercent !== null);
  const label = (id: string) => rule.components.find(component => component.scoreId === id)?.label ?? id;
  return <div className="publication-review">
    <section className="publication-explainer" aria-labelledby="publication-explanation">
      <div className="publication-explainer-heading"><span className="publication-symbol"><Icon name="globe" size={23}/></span><div><span className="publication-caption">A shared record on the blockchain</span><h3 id="publication-explanation">What happens when you publish?</h3></div></div>
      <p>Avalanche is the blockchain used to keep a public, dated record of your admission rules. Students can check their rulebook against that record.</p>
      <ol className="publication-outcomes">
        <li><Icon name="file" size={20}/><div><strong>This version gets a digital fingerprint</strong><p>A unique code represents the full rulebook, including score weights and eligibility. Changing a rule produces a different code.</p></div></li>
        <li><Icon name="lock" size={20}/><div><strong>The smart contract locks the reference</strong><p>The contract records the seat limit and fingerprint. FairPass cannot replace these rules for this intake. Changes require a new intake.</p></div></li>
        <li><Icon name="external" size={20}/><div><strong>You receive a publication receipt</strong><p>After the network confirms it, you can open the receipt and check when and where the rules were recorded.</p></div></li>
      </ol>
      <p className="publication-privacy"><Icon name="shield" size={18}/><span>Only the program’s rules reference is published here. Student names, individual scores and preferences are not included.</span></p>
    </section>
    <details className="publication-evidence"><summary>Technical details · rulebook fingerprint</summary><p>FairPass compares this SHA-256 fingerprint with the reference stored by the smart contract. A match shows that this rulebook is the recorded version.</p><code>{fingerprint || "Complete the required fields to generate the fingerprint."}</code><p>This check confirms the rulebook version. It does not verify student scores or prove that places were allocated correctly.</p></details>
    <section className="publication-rule-summary" aria-labelledby="publication-program">
      <span className="publication-caption">The version you are publishing</span>
      <h3 id="publication-program">{rule.programName || "Program name required"}</h3>
      <p>{rule.faculty}{rule.degree ? ` · ${rule.degree}` : ""}</p>
      <dl className="publication-facts">
        <div><dt>Academic year</dt><dd>{rule.academicYear}</dd></div>
        <div><dt>Admission round</dt><dd>{rule.round || "Not set"}</dd></div>
        <div><dt>Available seats</dt><dd>{rule.capacity}</dd></div>
        <div><dt>Rulebook version</dt><dd>{rule.version}</dd></div>
      </dl>
      <RuleWeightComposition rule={rule}/>
      <div className="publication-eligibility"><h4>Eligibility requirements</h4>
        <p>Required scores: {rule.requiredSubjects.length ? rule.requiredSubjects.map(label).join(", ") : "None selected"}.</p>
        {minimums.length ? <ul>{minimums.map(component => <li key={component.scoreId}>{component.label}: at least {component.minimumPercent}% of its {component.maximum}-point scale.</li>)}</ul> : <p>No minimum score thresholds set.</p>}
        {rule.qualifications.map((qualification, index) => <p key={index}>Required curriculum: {qualification.equals}.</p>)}
      </div>
    </section>
    <p className="publication-action-note">Publishing sends a blockchain transaction using the university’s configured account. Wait for confirmation before leaving this page. Local demos use the development network.</p>
  </div>;
};
