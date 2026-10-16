import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  errorMessage,
  type OfficeResult,
  type PublicProgram,
  type Receipt,
  type Session,
} from "../services/api";
import { issuanceBlock } from "./workflow";
type Attempt = {
  state: "queued" | "sending" | "issued" | "skipped" | "failed";
  message: string;
  receipt?: Receipt | null;
};
export function IssuanceWorkspace({
  session,
  programs,
  results,
  refresh,
  onBusyChange,
}: {
  session: Session;
  programs: PublicProgram[];
  results: OfficeResult[];
  refresh: () => Promise<void>;
  onBusyChange: (value: boolean) => void;
}) {
  const [programId, setProgramId] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [attempts, setAttempts] = useState<Record<string, Attempt>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState(false);
  const [intakeResults, setIntakeResults] = useState<OfficeResult[] | null>(
      null,
    ),
    [loading, setLoading] = useState(false);
  const running = useRef(false),
    program = programs.find((p) => p.programId === programId);
  useEffect(() => {
    let active = true;
    setIntakeResults(null);
    if (!programId) return;
    setLoading(true);
    setError("");
    void api<OfficeResult[]>("/office/results", {
      token: session.token,
    })
      .then((rows) => {
        if (active) setIntakeResults(rows);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [programId, session.token]);
  const refreshResults = async () => {
    await refresh();
    if (programId)
      setIntakeResults(
        await api<OfficeResult[]>("/office/results", {
          token: session.token,
        }),
      );
  };
  const cohort = (intakeResults ?? results).filter(
    (r) => r.programId === programId,
  );
  const state = (r: OfficeResult) =>
    r.credential
      ? "issued"
      : attempts[r.resultId]?.state === "failed"
        ? "failed"
        : issuanceBlock(r, program) === null
          ? "ready"
          : !r.confirmationRequestedAt && r.outcome === "admitted"
            ? "acceptance"
            : "blocked";
  const visible = cohort.filter(
    (r) =>
      (!search || r.studentId.toLowerCase().includes(search.toLowerCase())) &&
      (filter === "all" || state(r) === filter),
  );
  const ready = visible.filter((r) => issuanceBlock(r, program) === null),
    selectedReady = selected.filter((id) =>
      cohort.some(
        (r) => r.resultId === id && issuanceBlock(r, program) === null,
      ),
    );
  const summaries = useMemo(
    () =>
      Object.values(attempts).reduce(
        (a, v) => ({ ...a, [v.state]: a[v.state] + 1 }),
        { queued: 0, sending: 0, issued: 0, skipped: 0, failed: 0 },
      ),
    [attempts],
  );
  const update = (id: string, value: Attempt) =>
    setAttempts((old) => ({ ...old, [id]: value }));
  const send = async () => {
    if (running.current || !selectedReady.length) return;
    running.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setReview(false);
    const ids = [...selectedReady];
    setAttempts((old) => ({
      ...old,
      ...Object.fromEntries(
        ids.map((id) => [
          id,
          { state: "queued", message: "Waiting to send" } as Attempt,
        ]),
      ),
    }));
    try {
      // Re-read persisted state before sending. Issuance itself is idempotent and
      // the contract, not the checkbox count, enforces capacity and consent.
      const latest = await api<OfficeResult[]>(
        "/office/results",
        { token: session.token },
      );
      for (let index = 0; index < ids.length; index++) {
        const id = ids[index],
          record = latest.find((r) => r.resultId === id);
        if (record?.credential) {
          update(id, {
            state: "skipped",
            message: "Already issued — no new transaction sent",
          });
          continue;
        }
        const block = record
          ? issuanceBlock(record, program)
          : "Result unavailable";
        if (block) {
          update(id, { state: "failed", message: block });
          continue;
        }
        update(id, {
          state: "sending",
          message: "Waiting for network confirmation",
        });
        try {
          const response = await api<{ issuance: Receipt | null }>(
            `/issuer/results/${id}/issue`,
            { method: "POST", token: session.token },
          );
          update(id, {
            state: "issued",
            message: "Confirmed by the registry",
            receipt: response.issuance,
          });
        } catch (e) {
          update(id, { state: "failed", message: errorMessage(e) });
          if (e instanceof ApiError && [401, 403].includes(e.status)) {
            for (const remaining of ids.slice(index + 1))
              update(remaining, {
                state: "failed",
                message:
                  "Not sent. Sign in with an authorized account before retrying.",
              });
            break;
          }
        }
      }
    } catch (e) {
      setError(errorMessage(e));
      for (const id of ids)
        update(id, {
          state: "failed",
          message: "Not sent. Refresh results before retrying.",
        });
    } finally {
      try {
        await refreshResults();
        setSelected([]);
      } catch (e) {
        setError(
          `Refresh could not finish. Keep these batch results and refresh before retrying. ${errorMessage(e)}`,
        );
      }
      running.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <section
      className="office-issuance"
      aria-labelledby="office-issuance-title"
    >
      <h3 id="office-issuance-title">Review acceptances and issue records</h3>
      <p>
        Acceptance is recorded in FairPass. It does not confirm a place in
        myTCAS.
      </p>
      <label className="live-field">
        <span>Issuance program</span>
        <select
          value={programId}
          disabled={busy}
          onChange={(e) => {
            setProgramId(e.target.value);
            setSelected([]);
            setAttempts({});
            setReview(false);
            setFilter("all");
          }}
        >
          <option value="">Choose an intake</option>
          {programs
            .filter((p) => p.rulebook?.institutionId === session.institutionId)
            .map((p) => (
              <option key={p.programId} value={p.programId}>
                {p.rulebook!.programName} · {p.academicYear} ·{" "}
                {p.rulebook!.round} · v{p.rulebook!.version}
              </option>
            ))}
        </select>
      </label>
      {program ? (
        <>
          {loading ? (
            <p role="status">Loading results for this intake…</p>
          ) : null}
          <div className="office-intake-context">
            <strong>{program.rulebook?.programName}</strong>
            <span>
              {program.academicYear} · {program.rulebook?.round} · v
              {program.rulebook?.version}
            </span>
            <span>
              {program.active} / {program.capacity} active rights ·{" "}
              {program.issuanceAllowance} issuance allowance
            </span>
          </div>
          <div className="office-toolbar">
            <label className="live-field">
              <span>Search applicants</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Student ID"
              />
            </label>
            <label className="live-field">
              <span>Result status</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All offers</option>
                <option value="ready">Ready to issue</option>
                <option value="acceptance">Awaiting acceptance</option>
                <option value="issued">Issued</option>
                <option value="blocked">Needs review</option>
                <option value="failed">Needs attention in this batch</option>
              </select>
            </label>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={async () => {
                setError("");
                try {
                  await refreshResults();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Refresh results
            </button>
          </div>
          <div className="office-toolbar">
            <button
              className="button button-secondary"
              disabled={busy || loading || !intakeResults || !ready.length}
              onClick={() => {
                setSelected((old) => [
                  ...new Set([...old, ...ready.map((r) => r.resultId)]),
                ]);
                setReview(false);
              }}
            >
              Select all ready in this view
            </button>
            <button
              className="text-button"
              disabled={busy || !selected.length}
              onClick={() => {
                setSelected([]);
                setReview(false);
              }}
            >
              Clear selection
            </button>
            <span>
              {selectedReady.length} selected · {visible.length} results shown
            </span>
          </div>
          <div className="office-table-scroll">
            <table className="office-table">
              <caption className="sr-only">
                Admission results for the selected intake
              </caption>
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Applicant</th>
                  <th scope="col">Acceptance</th>
                  <th scope="col">Status</th>
                  <th scope="col">Next step / batch outcome</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const block = issuanceBlock(r, program),
                    attempt = attempts[r.resultId];
                  return (
                    <tr key={r.resultId}>
                      <td>
                        <input
                          aria-label={`Select ${r.studentId}`}
                          type="checkbox"
                          disabled={
                            busy || loading || !intakeResults || !!block
                          }
                          checked={selected.includes(r.resultId)}
                          onChange={(e) => {
                            setSelected(
                              e.target.checked
                                ? [...selected, r.resultId]
                                : selected.filter((id) => id !== r.resultId),
                            );
                            setReview(false);
                          }}
                        />
                      </td>
                      <th scope="row">{r.studentId}</th>
                      <td>
                        {r.confirmationRequestedAt ? (
                          <>
                            <span>Accepted in FairPass</span>
                            <small>
                              {new Date(
                                r.confirmationRequestedAt,
                              ).toLocaleString("en-GB")}
                            </small>
                          </>
                        ) : (
                          "Not accepted"
                        )}
                      </td>
                      <td>
                        {r.credential
                          ? r.credential.lifecycle === "valid"
                            ? "Issued"
                            : r.credential.lifecycle
                          : attempt?.state === "sending"
                            ? "Waiting for network"
                            : attempt?.state === "queued"
                              ? "Queued"
                              : state(r) === "failed"
                                ? "Needs attention"
                                : (block ?? "Ready to issue")}
                      </td>
                      <td>
                        {attempt ? (
                          <p>{attempt.message}</p>
                        ) : r.credential ? (
                          <a href={`/verify/${r.credential.credentialId}`}>
                            Verify issued record
                          </a>
                        ) : (
                          <p>
                            {block === "Awaiting acceptance"
                              ? "The student must accept this offer first."
                              : (block ??
                                "Select to include in issuance review.")}
                          </p>
                        )}
                        {attempt?.receipt ? (
                          <details>
                            <summary>Transaction receipt</summary>
                            <p>
                              Confirmed in block {attempt.receipt.blockNumber}
                            </p>
                            {[43113, 43114].includes(
                              attempt.receipt.chainId,
                            ) ? (
                              <a
                                href={`${attempt.receipt.chainId === 43113 ? "https://testnet.snowtrace.io" : "https://snowtrace.io"}/tx/${attempt.receipt.transactionHash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open receipt
                              </a>
                            ) : (
                              <code>{attempt.receipt.transactionHash}</code>
                            )}
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!visible.length ? (
            <p className="office-empty">
              No results match this view. Change the filter, or process a cohort
              first.
            </p>
          ) : null}
          {Object.keys(attempts).length ? (
            <p role="status" aria-live="polite">
              Batch: {summaries.issued} issued · {summaries.skipped} already
              issued · {summaries.failed} need attention ·{" "}
              {summaries.queued + summaries.sending} remaining.{" "}
              {busy
                ? "Keep this page open while requests finish."
                : "Issued records remain saved. Refresh, then select only ready results to retry; existing rights are not issued twice."}
            </p>
          ) : null}
          {review ? (
            <div className="office-issuance-review">
              <h4>Confirm issuance</h4>
              <p>
                {selectedReady.length} applicants ·{" "}
                {program.rulebook?.programName} · {program.academicYear} ·{" "}
                {program.rulebook?.round}
              </p>
              <p>
                This sends real transactions on the configured network. The
                institution pays the network fee. The contract checks
                acceptance, authorization and capacity for each record.
              </p>
              <div className="live-actions">
                <button
                  className="button button-primary"
                  disabled={
                    busy ||
                    !selectedReady.length ||
                    selectedReady.length > program.issuanceAllowance ||
                    selectedReady.length > program.capacity - program.active
                  }
                  onClick={() => void send()}
                >
                  Issue {selectedReady.length}{" "}
                  {selectedReady.length === 1 ? "record" : "records"}
                </button>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setReview(false)}
                >
                  Back to selection
                </button>
              </div>
              {selectedReady.length >
              Math.min(
                program.issuanceAllowance,
                program.capacity - program.active,
              ) ? (
                <p role="alert">
                  Selection exceeds the current capacity or issuance allowance.
                  Refresh results and reduce the selection.
                </p>
              ) : null}
            </div>
          ) : (
            <button
              className="button button-primary"
              disabled={
                busy || loading || !intakeResults || !selectedReady.length
              }
              onClick={() => setReview(true)}
            >
              Review selected records
            </button>
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="live-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
