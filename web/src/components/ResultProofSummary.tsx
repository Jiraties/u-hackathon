import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { ScoringEvidenceCard } from "./ScoringEvidenceCard";
import type { Proof, WalletRecord } from "../services/api";

type Props = {
  record: WalletRecord;
  chainId: number;
  resultVerified: boolean;
  busy: boolean;
  onCheckIntegrity: () => void;
  loadEvidence: () => Promise<Proof>;
};
type EvidenceCheck = {
  source: WalletRecord;
  state: "pending" | "loaded" | "failed";
  proof?: Proof;
};

export const ResultProofSummary = ({
  record,
  chainId,
  resultVerified,
  busy,
  onCheckIntegrity,
  loadEvidence,
}: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [check, setCheck] = useState<EvidenceCheck | null>(null);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const current = check?.source === record ? check : null;
  const scoring =
    current?.state === "loaded"
      ? (current.proof?.scoring ?? [])
      : (record.scoring ?? []);
  // Scope the headline to the first ranked program, rather than implying every
  // preference or the full allocation was verified.
  const evidence = scoring[0];
  const state =
    current?.state === "pending"
      ? "pending"
      : current?.state === "failed"
        ? "unavailable"
        : evidence?.status === "verified"
          ? "verified"
          : evidence?.calculatedScore !== undefined
            ? "failed"
            : evidence?.reason?.includes("could not be confirmed")
              ? "unavailable"
              : "not_verified";
  const integrity = current?.proof
    ? current.proof.verification.resultIntegrity === "verified"
    : resultVerified;
  const status = {
    verified: "Verified",
    pending: "Pending",
    not_verified: "Not checked",
    failed: "Check failed",
    unavailable: "Could not complete check",
  }[state];
  const title =
    state === "verified"
      ? "Your score calculation was verified."
      : state === "pending"
        ? "Checking your proof…"
        : state === "unavailable"
          ? "We couldn’t complete this check."
          : state === "failed"
            ? "This scoring check did not pass."
            : integrity
              ? "Your result record matches. Your scoring is not yet verified."
              : "Your score calculation isn’t verified yet.";
  const steps: { icon: IconName; label: string }[] = [
    { icon: "lock", label: "Scores stay off the public chain" },
    {
      icon: "file",
      label:
        state === "verified" ? "Calculation verified" : "Check the calculation",
    },
    {
      icon: "shield",
      label:
        chainId === 31337
          ? "Local chain checks the proof"
          : "Avalanche checks the proof",
    },
  ];
  const viewEvidence = async () => {
    const attempt = ++request.current;
    setCheck({ source: record, state: "pending" });
    dialog.current?.showModal();
    try {
      const proof = await loadEvidence();
      if (attempt === request.current && proof.resultId === record.resultId)
        setCheck({ source: record, state: "loaded", proof });
      else if (attempt === request.current)
        setCheck({ source: record, state: "failed" });
    } catch {
      if (attempt === request.current)
        setCheck({ source: record, state: "failed" });
    }
  };
  return (
    <aside
      className="result-proof-summary"
      aria-labelledby="result-proof-heading"
    >
      <h2 id="result-proof-heading">See what was checked.</h2>
      <p className="result-proof-intro">
        See what was checked and why it matters.
      </p>
      <section
        className={`result-proof-card result-proof-${state}`}
        aria-label="Score calculation verification"
        aria-busy={state === "pending"}
      >
        <div className="result-proof-status" role="status">
          <Icon
            name={
              state === "verified"
                ? "check"
                : state === "pending"
                  ? "clock"
                  : "info"
            }
            size={15}
          />
          {status}
        </div>
        <h3>{title}</h3>
        {evidence?.programName ? (
          <p className="result-proof-program">For {evidence.programName}</p>
        ) : null}
        <div
          className="result-proof-flow"
          aria-label="How private score verification works"
        >
          {steps.map((step) => (
            <div className="result-proof-step" key={step.icon}>
              <span className="result-proof-step-icon">
                <Icon name={step.icon} size={23} />
              </span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        <p className="result-proof-caption">
          {state === "verified"
            ? "Checked without publishing your scores."
            : state === "unavailable"
              ? "The check couldn’t finish. Try viewing the evidence again."
              : state === "failed"
                ? "Ask the admissions team to review the scores and rulebook. No successful check is claimed."
                : state === "pending"
                  ? "Reading the latest verification evidence."
                  : "This is how your calculation can be checked privately."}
        </p>
        <button
          type="button"
          className="button button-primary result-proof-evidence"
          onClick={() => void viewEvidence()}
          disabled={state === "pending"}
          aria-haspopup="dialog"
        >
          View evidence
          <Icon name="arrow" size={17} />
        </button>
        <p className="result-proof-scope">
          Scoring proof checks the calculation, not the overall admissions
          allocation.
        </p>
      </section>
      <button
        type="button"
        className="result-proof-integrity"
        disabled={busy}
        onClick={onCheckIntegrity}
        aria-haspopup="dialog"
      >
        <Icon name="file" size={16} />
        Check result integrity
        <Icon name="chevron" size={14} />
      </button>
      <dialog
        ref={dialog}
        className="rule-proof-dialog result-proof-dialog"
        aria-labelledby="score-proof-dialog-title"
      >
        <form method="dialog" className="dialog-close">
          <button className="close-button" aria-label="Close scoring evidence">
            ×
          </button>
        </form>
        <h2 id="score-proof-dialog-title">Your scoring evidence</h2>
        {state === "pending" ? (
          <p role="status">Checking the latest blockchain evidence…</p>
        ) : state === "failed" || state === "unavailable" ? (
          <>
            <p role="alert">
              {state === "failed"
                ? "This scoring check did not pass. Ask the admissions team to review the records."
                : "Verification couldn’t be completed. Try again when the service is available."}
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void viewEvidence()}
            >
              Try again
            </button>
          </>
        ) : evidence ? (
          <ScoringEvidenceCard evidence={evidence} />
        ) : (
          <p>
            No verified scoring proof is available for this result. You can
            still check whether your result matches its blockchain record.
          </p>
        )}
      </dialog>
    </aside>
  );
};

export default ResultProofSummary;
