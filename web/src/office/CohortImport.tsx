import { useId, useMemo, useState } from "react";
import type { AdmissionRulebook } from "../domain/rulebooks";
import { api, errorMessage } from "../services/api";
import {
  cohortTemplate,
  reviewCohortCsv,
  type CohortApplicant,
} from "./workflow";
export function CohortImport({
  rules,
  token,
  disabled,
  onApply,
}: {
  rules: AdmissionRulebook[];
  token: string;
  disabled: boolean;
  onApply: (rows: CohortApplicant[]) => void;
}) {
  const contentId = useId();
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const review = useMemo(() => reviewCohortCsv(text, rules), [text, rules]);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([cohortTemplate(rules)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fairpass-cohort-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const directory = await api<{id:string;name:string}[]>("/office/students",{token});
      const known=new Set(directory.map(student=>student.id));
      const missing=review.applicants.filter(applicant=>!known.has(applicant.id)).map(applicant=>applicant.id);
      if(missing.length){setMessage(`Accounts not in the available directory: ${missing.join(", ")}. Ask the administrator to check these accounts before importing.`);return;}
      onApply(review.applicants);
      setMessage(
        `${review.applicants.length} applicants imported. Review their scores and preferences before recording results.`,
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="office-import">
      <summary>Import a cohort from CSV</summary>
      <p>
        Import up to 100 applicants. This replaces the current unrecorded
        applicant list; it does not create accounts or record results.
      </p>
      <button
        className="button button-secondary"
        type="button"
        disabled={disabled || busy}
        onClick={download}
      >
        Download CSV template
      </button>
      <label className="live-field">
        <span>CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={disabled || busy}
          onChange={async (e) => {
            setMessage("");
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1_000_000) {
              setMessage("Use a CSV file smaller than 1 MB.");
              return;
            }
            try {
              setText(await file.text());
            } catch {
              setMessage("The file could not be read. Choose it again.");
            }
          }}
        />
      </label>
      <div className="live-field">
        <label htmlFor={contentId}>CSV content</label>
        <textarea
          id={contentId}
          rows={6}
          value={text}
          disabled={disabled || busy}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
          }}
          placeholder="Paste the completed template here"
        />
      </div>
      <p className="fine-print">
        Preferences use program slugs in order, separated by |. Use score IDs
        from the template. Imported consent is never used to authorize issuance.
      </p>
      {text && review.errors.length ? (
        <div className="live-error" role="alert">
          <strong>Fix these rows before importing</strong>
          <ul>
            {review.errors.slice(0, 12).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {review.errors.length > 12 ? (
            <p>
              {review.errors.length - 12} more errors. Fix these and review
              again.
            </p>
          ) : null}
        </div>
      ) : null}
      {text && !review.errors.length ? (
        <p role="status">
          {review.applicants.length} rows passed format checks. Student accounts
          will be checked when importing.
        </p>
      ) : null}
      <button
        className="button button-primary"
        disabled={disabled || busy || !text || !!review.errors.length}
        onClick={() => void apply()}
      >
        {busy
          ? "Checking accounts…"
          : `Import ${review.applicants.length} applicants`}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </details>
  );
}
