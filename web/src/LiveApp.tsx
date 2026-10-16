import { ResultProofSummary } from "./components/ResultProofSummary";
import { ScoringEvidenceCard } from "./components/ScoringEvidenceCard";
import toast from "react-hot-toast";
import { RulePublicationReview } from "./components/RulePublicationReview";
import { replaceRoute } from "./router";
import { RuleWeightComposition, RuleScoringEditor, RuleEligibilityEditor } from "./components/RuleEditors";
import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { Icon } from "./components/Icon";
import { Badge } from "./components/ui";
import { ShareTokenButton } from "./components/ShareTokenButton";
import { normalizeCredentialCode } from "./services/demoVerification";
import { Layout, type PageId } from "./components/Layout";
import {
  api,
  ApiError,
  bytes32,
  errorMessage,
  type Credential,
  type EventPage,
  type OfficeResult,
  type Proof,
  type PublicProgram,
  type Receipt,
  type Session,
  type Wallet,
} from "./services/api";
import {
  allocatePreview,
  evaluateRulebook,
  examComponents,
  validateRulebook,
  zkPolicyErrors,
  rulebookCommitment,
  type AdmissionRulebook,
} from "./domain/rulebooks";

function useSession(role: "student" | "institution") {
  const key = `fairpass-session-${role}`;
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? "null",
      ) as Session | null;
      if (!saved || !saved.token || !Number.isFinite(Date.parse(saved.expiresAt)) || Date.parse(saved.expiresAt) <= Date.now()) return null;
      localStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.removeItem(key);
      return saved;
    } catch {
      return null;
    }
  });
  const save = (value: Session | null) => {
    setSession(value);
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* Memory session remains usable. */
    }
  };
  useEffect(() => {
    const sync = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Session | null;
        setSession(saved?.token && Date.parse(saved.expiresAt) > Date.now() ? saved : null);
      } catch { setSession(null); }
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) sync(); };
    const wake = () => { if (session && Date.parse(session.expiresAt) <= Date.now()) save(null); };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", wake);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener("focus", wake); };
  }, [key, session]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = Date.parse(session.expiresAt) - Date.now();
      if (remaining <= 0) save(null);
      else timer = setTimeout(check, Math.min(2_147_483_647, remaining));
    };
    check();
    return () => clearTimeout(timer);
  }, [session]);
  return { session, save };
}
function useRequest() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (work: () => Promise<void>, feedback?: { loading: string; success: string }) => {
    setBusy(true);
    setError("");
    try {
      if (feedback) await toast.promise(Promise.resolve().then(work), {
        loading: feedback.loading, success: feedback.success, error: errorMessage,
      });
      else await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
const Alert = ({ children }: { children: ReactNode }) => (
  <p className="live-error" role="alert">
    {children}
  </p>
);
const Heading = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) => (
  <div className="live-heading">
    {eyebrow === "404" ? <p>404</p> : null}
    <h1>{title}</h1>
    {children ? <p>{children}</p> : null}
  </div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="live-field">
    <span>{label}</span>
    {children}
  </label>
);
const Json = ({
  value,
  label = "Technical evidence",
}: {
  value: unknown;
  label?: string;
}) => (
  <details>
    <summary>{label}</summary>
    <pre className="live-json">{JSON.stringify(value, null, 2)}</pre>
  </details>
);
function ReceiptView({ value }: { value: Receipt | null | undefined }) {
  if (!value)
    return (
      <p>No transaction receipt is saved. Check the chain before retrying.</p>
    );
  const url =
    value.chainId === 43113
      ? "https://testnet.snowtrace.io/tx/"
      : value.chainId === 43114
        ? "https://snowtrace.io/tx/"
        : null;
  return (
    <p className="live-id">
      Block {value.blockNumber} ·{" "}
      {url ? (
        <a href={url + value.transactionHash} target="_blank" rel="noreferrer">
          {value.transactionHash}
        </a>
      ) : (
        value.transactionHash
      )}
    </p>
  );
}
function Network({
  value,
}: {
  value: { chainId: number; contractAddress: string };
}) {
  return (
    <p className="live-id">
      Chain {value.chainId} · Contract {value.contractAddress}
    </p>
  );
}
function SignIn({
  role,
  onLogin,
}: {
  role: "student" | "institution";
  onLogin: (session: Session) => void;
}) {
  const [id, setId] = useState(""),
    [password, setPassword] = useState("");
  const { busy, error, run } = useRequest();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      onLogin(
        await api<Session>(
          role === "student" ? "/auth/login" : "/auth/institution/login",
          {
            method: "POST",
            body: {
              [role === "student" ? "studentId" : "operatorId"]: id.trim(),
              password,
            },
          },
        ),
      );
      setPassword("");
    });
  };
  return (
    <section className="panel live-panel live-signin">
      <Heading
        eyebrow={
          role === "student" ? "PRIVATE STUDENT WALLET" : "INSTITUTION ACCESS"
        }
        title="Sign in"
      >
        {role === "student"
          ? "Open your saved results and admission rights."
          : "Only authorized institutional accounts can publish rules and issue rights."}
      </Heading>
      <form onSubmit={submit}>
        <Field label={role === "student" ? "Student ID" : "Operator ID"}>
          <input
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={
              role === "student" ? "e.g. demo-pim" : "e.g. demo-office"
            }
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <Alert>{error}</Alert> : null}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p>
        {role === "student" ? (
          <>
            University staff? <a href="/university">Sign in for universities</a>
            .
          </>
        ) : (
          <>
            Student? <a href="/student/wallet">Sign in to My wallet</a>.
          </>
        )}
      </p>
      <p>
        Accounts are provisioned by the platform administrator. No wallet
        connection is required.
      </p>
    </section>
  );
}
function StudentWallet() {
  const { session, save } = useSession("student");
  const [wallet, setWallet] = useState<Wallet | null>(null),
    [selected, setSelected] = useState(""),
    [selectedRule, setSelectedRule] = useState(""),
    [proof, setProof] = useState<Proof | null>(null);
  const tokenDialog = useRef<HTMLDialogElement>(null),
    proofDialog = useRef<HTMLDialogElement>(null);
  const { busy, error, run } = useRequest();
  const refresh = async () => {
    try {
      setWallet(await api<Wallet>("/me/wallet", { token: session!.token }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) save(null);
      throw e;
    }
  };
  useEffect(() => {
    let active = true;
    if (session)
      void api<Wallet>("/me/wallet", { token: session.token })
        .then((w) => {
          if (active) setWallet(w);
        })
        .catch((e) => {
          if (active) {
            if (e instanceof ApiError && e.status === 401) save(null);
            void run(async () => {
              throw e;
            });
          }
        });
    else {
      setWallet(null);
      setProof(null);
    }
    return () => {
      active = false;
    };
  }, [session]);
  const record =
    wallet?.records.find((r) => r.resultId === selected) ??
    wallet?.records[wallet.records.length - 1];
  const resultId = record?.resultId;
  useEffect(() => {
    let active = true;
    setProof(null);
    if (session && resultId) {
      void api<Proof>(`/me/results/${resultId}/proof`, { token: session.token })
        .then((evidence) => { if (active) setProof(evidence); })
        .catch(() => { if (active) setProof(null); });
    }
    return () => { active = false; };
  }, [session?.token, resultId, record?.commitment]);
  if (!session) return <SignIn role="student" onLogin={save} />;
  const resultVerified = proof?.resultId === resultId && proof?.verification.resultIntegrity === "verified";
  const credential =
    record?.report.outcome === "admitted" ? record.credential : null;
  const rules = record?.report.rulebooks ?? [];
  const program =
    rules.find((r) => r.id === record?.program?.rulebookId) ??
    (rules.length === 1 ? rules[0] : undefined);
  const name = wallet?.student.name ?? session.name ?? "";
  const rankedRules =
    record?.report.trace
      ?.map((t) => rules.find((r) => r.programId === t.programId))
      .filter((r): r is AdmissionRulebook => !!r) ?? [];
  const orderedRules = rankedRules.length ? rankedRules : rules;
  const chosenRule =
    orderedRules.find((r) => r.id === selectedRule) ?? orderedRules[0];
  const check = () =>
    void run(async () => {
      setProof(
        await api<Proof>(`/me/results/${record!.resultId}/proof`, {
          token: session.token,
        }),
      );
      proofDialog.current?.showModal();
    });
  const pass =
    credential && wallet ? (
      <article className="token-card" aria-label="Your admission token">
        <div className="token-top">
          <span className="token-issuer-mark">
            <Icon name="graduation" size={24} />
          </span>
          <div>
            <span className="token-caption">Issued by</span>
            <h3>
              {record?.program?.institutionName ?? "Registered institution"}
            </h3>
          </div>
          <Icon name="graduation" size={28} />
        </div>
        <div className="token-main">
          <span className="token-type">Admission token</span>
          <h2>{program?.programName ?? "Confirmed admission"}</h2>
          <p>
            {program?.degree ??
              program?.faculty ??
              record?.program?.degree ??
              ""}
          </p>
          <div className="token-meta">
            <div>
              <span>Academic year</span>
              <strong>{record!.report.academicYear}</strong>
            </div>
            <div>
              <span>Current status</span>
              <strong>
                <i
                  className={`token-status-dot ${credential.status === "valid" ? "active" : credential.status}`}
                />
                {credential.lifecycle === "valid"
                  ? "Active"
                  : credential.lifecycle[0].toUpperCase() +
                    credential.lifecycle.slice(1)}
              </strong>
            </div>
          </div>
        </div>
        <div className="token-bottom">
          <div>
            <span className="token-caption">Token ID</span>
            <strong title={credential.credentialId}>
              {credential.credentialId.slice(0, 12)}…
              {credential.credentialId.slice(-6)}
            </strong>
          </div>
          <span className="token-sample">Fictional admissions</span>
        </div>
        <div className="token-network">
          <Icon name="globe" size={16} />
          <span>{networkName(wallet.chainId)}</span>
          <span className="network-notice">Read from chain</span>
        </div>
      </article>
    ) : null;
  const trace = record ? (
    <section
      className="proof-section trace-section"
      id="result-trace"
      tabIndex={-1}
    >
      <div className="section-heading">
        <div>
          <div className="result-verification-heading">
            <h2>Follow your result</h2>
              <button
                type="button"
                className={`evidence-badge result-verification-badge${resultVerified ? " on-chain" : ""}`}
                disabled={busy}
                onClick={check}
                aria-label="View result verification and blockchain details"
                aria-haspopup="dialog"
              >
                <span className="evidence-badge-symbol"><Icon name={resultVerified ? "check" : "file"} size={12} /></span>
                {resultVerified ? "Verified" : "View proof"}
                <Icon name="chevron" size={12} />
              </button>
          </div>
          <p>Your scores and the rulebook versions used for this round.</p>
        </div>
      </div>
      <div className="trace-layout">
        <div
          className="program-choices"
          role="group"
          aria-label="Choose a ranked program"
        >
          {orderedRules.map((rule, index) => {
            const calc = record.report.scoreRecords
              ? evaluateRulebook(
                  rule,
                  record.report.scoreRecords,
                  record.report.qualifications ?? {},
                )
              : null;
            return (
              <button
                type="button"
                key={rule.id}
                className={`program-choice${chosenRule?.id === rule.id ? " selected" : ""}`}
                aria-pressed={chosenRule?.id === rule.id}
                aria-controls="live-selected-trace"
                onClick={() => setSelectedRule(rule.id)}
              >
                <span className="choice-top">
                  <span className="preference-rank">
                    {rankedRules.length ? index + 1 : "—"}
                  </span>
                  <span>{wallet?.institutionName ?? rule.institutionId}</span>
                  <Icon name="chevron" size={17} />
                </span>
                <strong>{rule.programName}</strong>
                <span className="choice-score">
                  {calc?.status === "calculated" ? calc.total.toFixed(2) : "—"}
                  <small> / 100</small>
                </span>
                <span className="choice-bottom">
                  {rankedRules.length
                    ? "Ranked preference"
                    : "Preference order unavailable"}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="connected-rule-traces selected-trace"
          id="live-selected-trace"
        >
          {orderedRules
            .filter((r) => r.id === chosenRule?.id)
            .map((rule) => {
              const scores = record.report.scoreRecords;
              const calculation = scores
                ? evaluateRulebook(
                    rule,
                    scores,
                    record.report.qualifications ?? {},
                  )
                : null;
              return (
                <div key={rule.id}>
                  <div className="trace-heading">
                    <h3>{rule.programName}</h3>
                    <span>Rulebook v{rule.version}</span>
                  </div>
                  <div className="calculation-trace">
                    <div className="trace-node">
                      <span className="trace-node-dot">1</span>
                      <div>
                        <h4>Your exam scores</h4>
                        <div className="score-inputs">
                          {(
                            scores ??
                            Object.entries(record.report.scores).map(
                              ([id, score]) => ({
                                id,
                                label: id,
                                score,
                                maximum: 100,
                              }),
                            )
                          ).map((s) => (
                            <div key={s.id}>
                              <span>{s.label}</span>
                              <strong>
                                {s.score}
                                <small> / {s.maximum}</small>
                              </strong>
                            </div>
                          ))}
                        </div>
                        <p className="fine-print">
                          Fictional inputs · Score authenticity not verified
                        </p>
                      </div>
                    </div>
                    <div className="trace-node">
                      <span className="trace-node-dot">2</span>
                      <div>
                        <h4>Program scoring rules</h4>
                        <div className="formula-terms">
                          {rule.components.map((c) => (
                            <div key={c.scoreId}>
                              <span>
                                {c.label} × {c.weightPercent}%
                              </span>
                              <strong>Scale {c.maximum}</strong>
                            </div>
                          ))}
                        </div>
                        <details>
                          <summary>View rulebook evidence</summary>
                          <p>
                            These are the pinned rules for this result. A newer
                            version does not replace them.
                          </p>
                          <Json value={rule} />
                        </details>
                      </div>
                    </div>
                    <div className="trace-node">
                      <span className="trace-node-dot">3</span>
                      <div>
                        <h4>Calculated from your scores</h4>
                        <strong className="trace-total">
                          {calculation?.status === "calculated"
                            ? calculation.total.toFixed(2)
                            : "Unavailable"}
                          <small> / 100</small>
                        </strong>
                        <p className="fine-print">
                          Recalculated locally · Does not authenticate the
                          inputs
                        </p>
                      </div>
                    </div>
                    <div className="trace-node">
                      <span className="trace-node-dot">4</span>
                      <div>
                        <h4>Eligibility</h4>
                        <strong>
                          {calculation?.status === "calculated"
                            ? calculation.eligible
                              ? "Meets minimums"
                              : "Below a minimum"
                            : "Requirements unavailable"}
                        </strong>
                        <p className="fine-print">
                          Eligibility does not guarantee a seat.
                        </p>
                      </div>
                    </div>
                    <div className="trace-node trace-outcome">
                      <span className="trace-node-dot">
                        <Icon name="file" size={16} />
                      </span>
                      <div>
                        <h4>Reported admission outcome</h4>
                        <strong>
                          {record.report.outcome === "admitted"
                            ? "Admitted"
                            : "Not admitted"}
                        </strong>
                        <p className="fine-print">
                          Fictional report · {record.report.round}. This is the
                          overall round result; a calculation alone does not
                          establish why a seat was assigned.
                        </p>
                        <button
                          className="evidence-badge"
                          disabled={busy}
                          onClick={check}
                        >
                          View result evidence <Icon name="chevron" size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      {!rules.length ? (
        <p>No pinned rulebook is available for this historical result.</p>
      ) : null}
      <div className="allocation-note">
        <Icon name="info" size={20} />
        <p>
          A score explains the calculation. Checking the complete allocation
          also needs all applicants, preferences, capacity and selection rules.
        </p>
      </div>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={check}
      >
        Check result integrity
      </button>
      {record.scoring?.map(evidence => <ScoringEvidenceCard key={evidence.programId} evidence={evidence} busy={busy} onVerify={() => void run(async () => {
        await api(`/me/results/${record.resultId}/scoring`, {method:"POST",token:session.token,body:{programId:evidence.programId}});
        await refresh();
      }, {loading:"Generating a private proof and waiting for blockchain verification…",success:"Private scoring proof verified by the smart contract."})}/>)}
      <Json value={record.report} label="Private report details" />
    </section>
  ) : null;
  return (
    <div className="wallet-page">
      <div className="wallet-welcome">
        <span>
          Hi, {name}
          <span className="welcome-dot">.</span>
        </span>
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              try {
                await api("/auth/logout", {
                  method: "POST",
                  token: session.token,
                });
              } finally {
                save(null);
              }
            })
          }
        >
          Sign out
        </button>
      </div>
      <div className="wallet-heading">
        <h1>
          {credential
            ? "Your admission. Now a token."
            : record?.report.outcome === "not_admitted"
              ? "Your result. Clearly explained."
              : "Your next chapter starts here."}
        </h1>
        <p>
          {credential
            ? "Issued by your institution. Ready to be checked. No crypto wallet needed."
            : "Your admission result and supporting records in one place."}
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!wallet ? <p role="status">Loading your records…</p> : null}
      {wallet && wallet.records.length > 1 ? (
        <Field label="Admission round">
          <select
            value={record?.resultId}
            onChange={(e) => {
              setSelected(e.target.value);
              setProof(null);
            }}
          >
            {wallet.records.map((r) => (
              <option key={r.resultId} value={r.resultId}>
                {r.report.academicYear} · {r.report.round}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {credential ? (
        <div className="wallet-hero">
          <section className="wallet-pass-section">
            <div className="pass-stack">{pass}</div>
            <div className="token-actions">
              <button
                className="button button-primary"
                onClick={() => tokenDialog.current?.showModal()}
              >
                View token <Icon name="arrow" size={18} />
              </button>
              <a
                className="button button-secondary"
                href={`/verify/${credential.credentialId}`}
              >
                <Icon name="shield" size={18} />
                Verify
              </a>
              <ShareTokenButton credentialId={credential.credentialId} live />
            </div>
            <p className="wallet-pass-note">
              <Icon name="lock" size={14} />
              Non-transferable. An academic record, not a financial asset.
            </p>
          </section>
          <aside className="wallet-story">
            <span className="story-symbol">
              <Icon name="graduation" size={28} />
            </span>
            <h2>
              A university-issued token.
              <br />A record you can share.
            </h2>
            <p>Your program and current status in one checkable record.</p>
            <ConnectedGuide />
            <div className="quiet-privacy">
              <Icon name="lock" size={20} />
              <p>Your name and scores stay in your private account.</p>
            </div>
          </aside>
        </div>
      ) : record ? (
        <div className="result-overview">
          <section className="admission-result-card">
            <div className="result-card-heading">
              <Icon name="file" size={23} />
              <span>Admission Result</span>
              <Badge tone="blue">Fictional report</Badge>
            </div>
            <p className="result-card-year">
              Academic year {record.report.academicYear}
            </p>
            <h2>
              {record.report.outcome === "admitted"
                ? "Admission offered"
                : "Not admitted"}
            </h2>
            <p className="result-card-round">{record.report.round}</p>
            {record.report.outcome === "admitted" ? (
              record.confirmationRequestedAt ? (
                <p role="status">
                  Confirmation requested. Waiting for institution issuance.
                </p>
              ) : (
                <button
                  disabled={busy}
                  className="button button-primary"
                  onClick={() => {
                    if (
                      confirm(
                        "Confirm admission? The institution will issue your admission token separately.",
                      )
                    )
                      void run(async () => {
                        await api(`/me/results/${record.resultId}/confirm`, {
                          method: "POST",
                          token: session.token,
                        });
                        await refresh();
                      }, { loading: "Submitting your confirmation…", success: "Confirmation submitted. Your university can now issue your admission token." });
                  }}
                >
                  Request confirmation
                </button>
              )
            ) : (
              <a className="button button-primary" href="#result-trace">
                See why <Icon name="arrow" size={18} />
              </a>
            )}
            <div className="result-card-foot">
              <span>
                {record.report.outcome === "admitted"
                  ? "Offer recorded"
                  : "No admission right issued"}
              </span>
            </div>
          </section>
          {record.report.outcome === "not_admitted" ? (
            <ResultProofSummary
              key={record.resultId}
              record={record}
              chainId={wallet!.chainId}
              resultVerified={resultVerified}
              busy={busy}
              onCheckIntegrity={check}
              loadEvidence={() => api<Proof>(`/me/results/${record.resultId}/proof`, { token: session.token })}
            />
          ) : <aside className="wallet-story">
            <h2>Your result record</h2>
            <p>An offer and an issued admission token are separate records.</p>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={check}
            >
              Check result integrity
            </button>
            <ConnectedGuide />
          </aside>}
        </div>
      ) : wallet ? (
        <section className="quiet-empty">
          <Icon name="clock" size={30} />
          <h2>No results yet</h2>
          <p>Your institution has not published a result for this account.</p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void run(refresh)}
          >
            Refresh records
          </button>
        </section>
      ) : null}
      {credential ? (
        <details className="score-drawer result-drawer">
          <summary>
            <Icon name="chart" size={22} />
            <span>
              <strong>Scores and admission result</strong>
              <small>Private records for this round</small>
            </span>
            <Icon name="down" size={18} />
          </summary>
          {trace}
        </details>
      ) : (
        trace
      )}
      {record ? (
        <details className="connected-evidence">
          <summary>View blockchain details</summary>
          <Network value={wallet!} />
          <p className="live-id">Result: {record.resultId}</p>
          <ReceiptView value={record.issuance ?? record.publication} />
        </details>
      ) : null}
      <dialog
        ref={tokenDialog}
        className="token-dialog"
        aria-labelledby="live-token-title"
      >
        <form method="dialog" className="dialog-close">
          <button className="close-button" aria-label="Close token details">
            ×
          </button>
        </form>
        <h2 id="live-token-title">Your admission token</h2>
        {pass}
        <p className="live-id">{credential?.credentialId}</p>
        <p>A valid record does not establish the presenter’s identity.</p>
      </dialog>
      <dialog
        ref={proofDialog}
        className="rule-proof-dialog"
        aria-labelledby="live-proof-title"
      >
        <form method="dialog" className="dialog-close">
          <button className="close-button" aria-label="Close result evidence">
            ×
          </button>
        </form>
        <h2 id="live-proof-title">
          {proof?.verification.resultIntegrity === "verified" ? "Your result record is verified" : "Result verification"}
        </h2>
        <p>
          {proof?.verification.resultIntegrity === "verified"
            ? "Your result matches the fingerprint recorded on the blockchain. The recorded fingerprint cannot be changed."
            : "We could not confirm that this result matches a recorded blockchain fingerprint."}
        </p>
        {proof ? <>
          <dl className="detail-list">
            <div><dt>Network</dt><dd>{networkName(proof.chainId)}</dd></div>
            <div><dt>Recorded</dt><dd>{Number(proof.recordedAt) > 0 ? new Date(Number(proof.recordedAt) * 1000).toLocaleString() : "Not recorded"}</dd></div>
            <div><dt>Contract</dt><dd className="live-id">{proof.contractAddress}</dd></div>
            <div><dt>Result fingerprint</dt><dd className="live-id">{proof.onchainCommitment}</dd></div>
          </dl>
          <ReceiptView value={proof.publication} />
        </> : null}
        <p>Your identity, scores and preferences stay private. This check confirms the result record; it does not independently verify the allocation.</p>
        <dl className="detail-list">
          <div>
            <dt>Score authenticity</dt>
            <dd>Not verified</dd>
          </div>
          <div>
            <dt>Allocation correctness</dt>
            <dd>Not verified</dd>
          </div>
        </dl>
        <Json value={proof} />
      </dialog>
    </div>
  );
}
const networkName = (id: number) =>
  id === 43113
    ? "Avalanche Fuji"
    : id === 43114
      ? "Avalanche C-Chain"
      : `Local chain ${id}`;
function ConnectedGuide() {
  return (
    <details className="verification-guide">
      <summary>
        How verification works <Icon name="down" size={16} />
      </summary>
      <ol>
        <li>The institution issues the credential.</li>
        <li>Avalanche records its status.</li>
        <li>Anyone can check the public record.</li>
      </ol>
      <p className="fine-print">
        Fictional admissions. This demo uses public development keys; issuer
        trust is not secure.
      </p>
    </details>
  );
}
function Verify() {
  const initial = window.location.pathname.startsWith("/verify/")
    ? window.location.pathname.slice(8)
    : "";
  const [id, setId] = useState(initial),
    [credential, setCredential] = useState<Credential | null>(null),
    [missing, setMissing] = useState(false);
  const { busy, error, run } = useRequest();
  const verify = async (value: string) => {
    setCredential(null);
    setMissing(false);
    const code = normalizeCredentialCode(value);
    if (!bytes32.test(code))
      throw new Error(
        "Enter a token ID: 0x followed by 64 hexadecimal characters.",
      );
    setId(code);
    try {
      setCredential(await api<Credential>(`/public/verify/${code}`));
      replaceRoute(`/verify/${encodeURIComponent(code)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else throw e;
    }
  };
  useEffect(() => {
    if (initial) void run(() => verify(initial));
  }, []);
  return (
    <div className="verify-page">
      <div className="verify-intro">
        <span className="verify-symbol">
          <Icon name="shield" size={31} />
        </span>
        <h1>A token. A clear answer.</h1>
        <p>Check who issued it, and whether it is still active.</p>
      </div>
      <form
        className="verification-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => verify(id));
        }}
      >
        <label className="field-label" htmlFor="token-code">
          Token code or verification link
        </label>
        <div className="verification-input-row">
          <input
            id="token-code"
            autoComplete="off"
            spellCheck={false}
            required
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setCredential(null);
              setMissing(false);
            }}
            placeholder="0x… or a FairPass link"
          />
          <button className="button button-primary" disabled={busy}>
            {busy ? "Checking chain…" : "Verify token"}{" "}
            <Icon name="arrow" size={19} />
          </button>
        </div>
        <p className="fine-print">
          Checks the configured registry. Student names and scores stay private.
        </p>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {missing ? (
        <section className="verification-result result-not_found" role="status">
          <h2>Token not found</h2>
          <p>Check the ID and network, then try again.</p>
        </section>
      ) : null}
      {credential ? (
        <section
          className={`verification-result result-${credential.status === "valid" ? "valid" : credential.status}`}
          aria-live="polite"
        >
          <div className="result-top">
            <span className="result-symbol">
              <Icon
                name={credential.status === "valid" ? "check" : "info"}
                size={28}
              />
            </span>
            <Badge>{networkName(credential.chainId)}</Badge>
          </div>
          <h2>
            {credential.lifecycle === "enrolled"
              ? "Enrolled"
              : credential.status === "valid"
                ? "Valid admission right"
                : credential.status === "withdrawn"
                  ? "This token was withdrawn."
                  : "This token was revoked."}
          </h2>
          <p className="result-description">
            {credential.status === "valid"
              ? "This credential is active in the configured registry."
              : "This credential is no longer an active admission right."}
          </p>
          <div className="verified-record">
            <span className="issuer-avatar">
              <Icon name="university" size={26} />
            </span>
            <div>
              <h3>
                {credential.metadata?.institutionName ?? "Registered issuer"}
              </h3>
              <p>{credential.metadata?.programName ?? "Admission token"}</p>
              <span>Academic year {credential.academicYear}</span>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Issuer currently authorized</dt>
              <dd>
                {credential.issuerCurrentlyAuthorized
                  ? "Yes"
                  : "No — check with the institution before accepting this record."}
              </dd>
            </div>
            <div>
              <dt>Token ID</dt>
              <dd>{credential.credentialId}</dd>
            </div>
          </dl>
          <details className="connected-evidence">
            <summary>View blockchain details</summary>
            <Network value={credential} />
            <Json value={credential} />
          </details>
          <a
            className="text-link"
            href={`/transparency?program=${credential.programId}`}
          >
            See this program’s public capacity <Icon name="arrow" size={17} />
          </a>
          <p className="fine-print">
            Fictional admissions. Public development keys do not establish
            trusted university identity.
          </p>
        </section>
      ) : !missing && !error && !busy ? (
        <div className="verification-empty">
          <Icon name="file" size={28} />
          <p>
            A university-issued token can be checked without a student’s name or
            exam scores.
          </p>
        </div>
      ) : null}
      <ConnectedGuide />
      <p className="verifier-identity">
        <Icon name="lock" size={16} />A valid record does not establish the
        presenter’s identity.
      </p>
    </div>
  );
}
function Transparency() {
  const [programs, setPrograms] = useState<PublicProgram[]>([]),
    [selected, setSelected] = useState(
      new URLSearchParams(location.search).get("program") ?? "",
    ),
    [events, setEvents] = useState<EventPage | null>(null);
  const { busy, error, run } = useRequest();
  const generation = useRef(0);
  const refresh = async () =>
    setPrograms(await api<PublicProgram[]>("/public/programs"));
  useEffect(() => {
    void run(refresh);
  }, []);
  const program = programs.find((p) => p.programId === selected) ?? programs[0];
  useEffect(() => {
    generation.current++;
    setEvents(null);
  }, [program?.programId]);
  const loadEvents = async (from?: string) => {
    if (!program) return;
    const gen = generation.current;
    const page = await api<EventPage>(
      `/public/programs/${program.programId}/events?fromBlock=${from ?? program.registration?.blockNumber ?? program.deploymentBlock}`,
    );
    if (gen === generation.current)
      setEvents((old) =>
        from && old
          ? { ...page, events: [...old.events, ...page.events] }
          : page,
      );
  };
  const circumference = 2 * Math.PI * 104,
    percentage = program
      ? Math.min(program.active / Math.max(program.capacity, 1), 1)
      : 0;
  const titles: Record<string, string> = {
    ProgramRegistered: "Program registered",
    RulesLocked: "Rules locked",
    RulesRevised: "Rulebook revised",
    RightIssued: "Admission token issued",
    RightEnrolled: "Enrollment recorded",
    RightWithdrawn: "Admission right withdrawn",
    RightRevoked: "Admission token revoked",
    CapacityChanged: "Capacity updated",
    ReallocationAuthorized: "Seat reallocation authorized",
  };
  return (
    <div className="focused-page transparency-page">
      <Heading eyebrow="" title="Every seat, accounted for.">
        See the admission limit, active rights, and the changes behind them.
      </Heading>
      {error ? <Alert>{error}</Alert> : null}
      {busy ? <p role="status">Loading chain evidence…</p> : null}
      {!busy && !error && !program ? (
        <section className="quiet-empty">
          <h2>No programs yet</h2>
          <p>Published programs will appear here.</p>
        </section>
      ) : null}
      {program ? (
        <>
          <div className="public-program-picker">
            <div>
              <span className="issuer-avatar">
                <Icon name="university" size={24} />
              </span>
              <div>
                <strong>
                  {program.metadata?.institutionName ??
                    "Registered institution"}
                </strong>
                <span>
                  {networkName(program.chainId)} · Academic year{" "}
                  {program.academicYear}
                </span>
              </div>
            </div>
            <Field label="Choose a program">
              <select
                value={program.programId}
                onChange={(e) => setSelected(e.target.value)}
              >
                {programs.map((p) => (
                  <option key={p.programId} value={p.programId}>
                    {p.rulebook?.programName ??
                      p.metadata?.programName ??
                      p.programId}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <section className="capacity-feature">
            <div className="capacity-visual">
              <svg
                className="capacity-ring"
                viewBox="0 0 250 250"
                role="img"
                aria-label={`${program.active} active admission rights out of ${program.capacity} authorized seats`}
              >
                <circle className="ring-track" cx="125" cy="125" r="104" />
                <circle
                  className="ring-fill"
                  cx="125"
                  cy="125"
                  r="104"
                  strokeDasharray={`${circumference * percentage} ${circumference}`}
                  transform="rotate(-90 125 125)"
                />
              </svg>
              <div className="ring-label">
                <strong>{program.active}</strong>
                <span>active admission rights</span>
              </div>
              <div className="ring-caption">
                out of {program.capacity} authorized seats
              </div>
            </div>
            <div className="capacity-story">
              <Badge
                tone={program.active <= program.capacity ? "green" : "amber"}
              >
                {program.active <= program.capacity
                  ? "Within limit"
                  : "Over capacity"}{" "}
                · On-chain
              </Badge>
              <h2>
                {program.capacity} seats.
                <br />
                One shared record.
              </h2>
              <p>
                {program.rulebook?.programName ??
                  program.metadata?.programName ??
                  "Registered program"}
              </p>
              <dl className="capacity-facts">
                <div>
                  <dt>Authorized capacity</dt>
                  <dd>{program.capacity}</dd>
                </div>
                <div>
                  <dt>Active admission rights</dt>
                  <dd>{program.active}</dd>
                </div>
                <div>
                  <dt>Historical tokens issued</dt>
                  <dd>{program.historicalIssued}</dd>
                </div>
                <div>
                  <dt>Issuance allowance</dt>
                  <dd>{program.issuanceAllowance}</dd>
                </div>
              </dl>
              <p className="fine-print">
                Unoccupied capacity does not automatically authorize
                reallocation.
              </p>
            </div>
          </section>
          <div className="transparency-bottom">
            <section className="timeline-section">
              <div className="section-heading">
                <div>
                  <h2>What changed?</h2>
                  <p>Authorized actions leave a visible history.</p>
                </div>
              </div>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => void run(() => loadEvents())}
              >
                View registry events
              </button>
              {events ? (
                <>
                  <ol className="public-timeline">
                    {events.events.map((e) => (
                      <li key={`${e.transactionHash}-${e.logIndex}`}>
                        <span className="timeline-symbol">
                          <Icon name="file" size={18} />
                        </span>
                        <div>
                          <strong>{titles[e.event] ?? e.event}</strong>
                          <p>Block {e.blockNumber}</p>
                          <ReceiptView
                            value={{
                              chainId: program.chainId,
                              contractAddress: program.contractAddress,
                              transactionHash: e.transactionHash,
                              blockNumber: e.blockNumber,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                  {!events.events.length ? (
                    <p>No events in this block range.</p>
                  ) : null}
                  <p className="fine-print">
                    Blocks {events.fromBlock}–{events.toBlock}. History is
                    paginated.
                  </p>
                  {events.nextBlock ? (
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => loadEvents(events.nextBlock!))
                      }
                    >
                      Load more events
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>
            <aside className="guarantees-card">
              <Icon name="shield" size={29} />
              <h2>What blockchain can guarantee.</h2>
              <p>
                Authorized issuance, capacity limits and credential status
                rules.
              </p>
              <div className="guarantee-note">
                <Icon name="info" size={19} />
                <p>
                  It cannot prove that TCAS selected the right applicants, or
                  account for admissions outside FairPass.
                </p>
              </div>
              <details>
                <summary>View blockchain details</summary>
                <Network value={program} />
                <Json value={program} />
              </details>
            </aside>
          </div>
        </>
      ) : null}
      <p className="fine-print connected-context">
        Fictional admissions · No university affiliation or official TCAS
        integration.
      </p>
    </div>
  );
}
const defaultRule = (zkEnabled = false): AdmissionRulebook => ({
  id: `rule-${crypto.randomUUID()}`,
  programId: "demo-engineering",
  institutionId: "fairpass-demo",
  programName: "Fictional Engineering",
  faculty: "Engineering",
  academicYear: 2027,
  round: zkEnabled ? "Round 3" : "demo-1",
  capacity: 1,
  version: 1,
  method: "normalized-weighted-sum",
  components: zkEnabled ? ["tgat","math1","physics"].map((id,index)=>({...examComponents.find(c=>c.scoreId===id)!,weightPercent:index===0?20:40,minimumPercent:50})) : [
    { ...examComponents[0], weightPercent: 100, minimumPercent: null },
  ],
  requiredSubjects: [],
  qualifications: [],
  status: "draft",
  createdAt: new Date().toISOString(),
  sealedAt: null,
  commitment: null,
  chainReference: null,
  publication: null,
});
function RuleTrial({ rule }: { rule: AdmissionRulebook }) {
  const [inputs, setInputs] = useState<Record<string, number>>({}),
    [curriculum, setCurriculum] = useState("Science–Mathematics");
  const scores = rule.components.map((c) => ({
    id: c.scoreId,
    subject: c.label,
    label: c.label,
    score: inputs[c.scoreId] ?? c.maximum * 0.75,
    maximum: c.maximum,
    provenance: "simulated-exam-provider" as const,
  }));
  const result = evaluateRulebook(rule, scores, { curriculum });
  return (
    <section className="live-proof">
      <h3>Try a fictional calculation</h3>
      <p>Change the sample inputs to check this rulebook before publishing.</p>
      <div className="live-grid">
        {scores.map((c) => (
          <Field key={c.id} label={`Sample ${c.label} / ${c.maximum}`}>
            <input
              type="number"
              step="any"
              min={0}
              max={c.maximum}
              value={Number.isFinite(c.score) ? c.score : ""}
              onChange={(e) =>
                setInputs({ ...inputs, [c.id]: e.target.valueAsNumber })
              }
            />
          </Field>
        ))}
        <Field label="Sample curriculum">
          <select
            value={curriculum}
            onChange={(e) => setCurriculum(e.target.value)}
          >
            <option>Science–Mathematics</option>
            <option>Arts–Languages</option>
          </select>
        </Field>
      </div>
      {result.status === "calculated" ? (
        <>
          <div className="formula-terms">
            {result.terms.map((t, i) => (
              <div key={i}>
                <span>
                  {t.label}: {t.score} ÷ {t.maximum} × {t.weightPercent}%
                </span>
                <strong>{t.contribution.toFixed(2)}</strong>
              </div>
            ))}
          </div>
          <p>
            <strong>{result.total.toFixed(2)} / 100</strong> ·{" "}
            {result.eligible ? "Meets minimums" : "Does not meet requirements"}
          </p>
        </>
      ) : (
        <p>{result.reason}</p>
      )}
      <p className="fine-print">
        Fictional sample only. Eligibility does not guarantee a seat or
        authenticate scores.
      </p>
    </section>
  );
}

function RuleBuilder({
  session,
  refresh,
  initial,
  initialRevision = 0,
  zkEnabled = false,
}: {
  session: Session;
  initial?: AdmissionRulebook;
  initialRevision?: number;
  zkEnabled?: boolean;
  refresh: () => Promise<void>;
}) {
  const [rule, setRule] = useState<AdmissionRulebook>(() => ({
      ...(initial ?? defaultRule(zkEnabled)),
      institutionId: session.institutionId!,
    })),
    [step, setStep] = useState(0),
    [hash, setHash] = useState(""),
    [published, setPublished] = useState<{
      programId: string;
      rulesHash: string;
      lock: Receipt | null;
    } | null>(null);
  const { busy, error, run } = useRequest();
  const [revision, setRevision] = useState(initialRevision),
    [saved, setSaved] = useState(false);
  const saveDraft = async () => {
    const value = await api<{ revision: number }>("/office/rulebooks/drafts", {
      method: "POST",
      token: session.token,
      body: { rule, expectedRevision: revision },
    });
    setRevision(value.revision);
    setSaved(true);
    await refresh();
  };
  const proofPolicyErrors = zkEnabled ? zkPolicyErrors(rule) : [];
  const steps = [
    "Program details",
    "Scoring rules",
    "Eligibility",
    "Review rulebook",
  ];
  useEffect(() => {
    let cancelled=false;
    setHash("");
    if(step===3) void rulebookCommitment(rule).then(value=>{if(!cancelled)setHash(value);}).catch(()=>{});
    return()=>{cancelled=true;};
  }, [rule,step]);
  const patch = (value: Partial<AdmissionRulebook>) => {
    if (busy || published) return;
    setSaved(false);
    setRule({ ...rule, ...value });
  };
  return (
    <div className="restored-rule-builder">
      <ol className="rule-builder-steps" aria-label="Rulebook progress">{steps.map((name,index)=><li key={name} className={step===index?"current":step>index?"complete":""} aria-current={step===index?"step":undefined}><span>{step>index?<Icon name="check" size={15}/>:index+1}</span>{name}</li>)}</ol>
      <div className="rule-builder-layout"><section className="rule-builder-workspace">
      <div className="section-heading">
        <div>
          <h2>{steps[step]}</h2>
          <p className="builder-step-intro">{["Give the rules a program, round and seat limit.","Choose the scores, then give each one its share.","Set the minimums students must meet.","Check the complete version before publishing it."][step]}</p>
        </div>
        <button
          className="button button-secondary"
          disabled={busy || !!published}
          onClick={() => void run(saveDraft, { loading: "Saving your draft…", success: "Draft saved. You can continue editing later." })}
        >
          Save draft
        </button>
      </div>
      {saved ? (
        <p role="status">Draft saved. You can open it on another device.</p>
      ) : null}
      {zkEnabled ? <p className="fine-print">Private proof support: three exam subjects out of 100, two decimal places, weighted scores and subject minimums. Curriculum and GPAX are not part of this proof.</p> : null}
      <fieldset className="rule-editor-fields" disabled={busy || !!published}>
      {step === 0 ? (
        <div className="builder-fields">
          {(["programId", "programName", "faculty", "round"] as const).map(
            (key) => (
              <Field
                key={key}
                label={
                  {
                    programId: "Program slug",
                    programName: "Program name",
                    faculty: "Faculty",
                    round: "Admission round",
                  }[key]
                }
              >
                <input
                  value={rule[key]}
                  onChange={(e) => patch({ [key]: e.target.value })}
                />
              </Field>
            ),
          )}
          <Field label="Degree (optional)">
            <input
              value={rule.degree ?? ""}
              onChange={(e) => patch({ degree: e.target.value || undefined })}
            />
          </Field>
          <Field label="Academic year">
            <input
              type="number"
              min="2020"
              max="2100"
              value={Number.isFinite(rule.academicYear) ? rule.academicYear : ""}
              onChange={(e) => patch({ academicYear: e.target.valueAsNumber })}
            />
          </Field>
          <Field label="Capacity">
            <input
              type="number"
              min="1"
              max="10000"
              value={Number.isFinite(rule.capacity) ? rule.capacity : ""}
              onChange={(e) => patch({ capacity: e.target.valueAsNumber })}
            />
          </Field>
        </div>
      ) : null}
      {step === 1 ? <RuleScoringEditor rule={rule} onChange={patch} /> : null}
      {step === 2 ? <RuleEligibilityEditor rule={rule} onChange={patch} /> : null}
      {step === 3 ? (
        <>
          <RulePublicationReview rule={rule} fingerprint={hash} />
          {[...validateRulebook(rule),...proofPolicyErrors].map((message) => (
            <p key={message} className="live-error">
              {message}
            </p>
          ))}
          <button
            className="button button-primary"
            disabled={busy || !!published || !hash || validateRulebook(rule).length > 0 || proofPolicyErrors.length > 0}
            onClick={() =>
              void run(async () => {
                if (
                  !confirm(
                    "Publish this rulebook? The smart contract will record its fingerprint and seat limit, then lock this intake. You cannot replace these rules afterward. The university account pays the network fee.",
                  )
                )
                  return;
                await saveDraft();
                const result = await toast.promise((async () => {
                  const response = await api<{
                    programId: string;
                    rulesHash: string;
                    lock: Receipt | null;
                  }>("/office/rulebooks/publish", {
                    method: "POST", token: session.token, body: rule,
                  });
                  if (response.rulesHash !== hash) throw new Error("The returned commitment does not match this rulebook.");
                  return response;
                })(), {
                  loading: "Publishing rules… waiting for network confirmation.",
                  success: (response) => response.lock?.chainId === 43113 || response.lock?.chainId === 43114
                    ? "Published on Avalanche. This intake’s rules are locked."
                    : "Rules published and locked on the connected network.",
                  error: errorMessage,
                });
                setPublished(result);
                await refresh();
              })
            }
          >
            {busy
              ? "Publishing… waiting for network confirmation"
              : published
                ? "Rules locked"
                : "Publish on Avalanche"}
          </button>
          <RuleTrial rule={rule} />
          <Json value={rule} label="View the full rulebook data" />
        </>
      ) : null}
      </fieldset>
      {error ? <Alert>{error}</Alert> : null}
      {published ? (
        <div role="status">
          <h3>Rules locked on chain</h3>
          <p className="live-id">{published.programId}</p>
          <ReceiptView value={published.lock} />
          <button
            className="button"
            onClick={() => {
              setRule({
                ...defaultRule(zkEnabled),
                institutionId: session.institutionId!,
              });
              setPublished(null);
              setRevision(0);
              setSaved(false);
              setStep(0);
            }}
          >
            Create another intake
          </button>
        </div>
      ) : null}
      <div className="builder-navigation">
        {step > 0 ? (
          <button className="button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < 3 ? (
          <button
            className="button button-primary"
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        ) : null}
      </div>
    </section><aside className="rule-builder-aside"><span className="story-symbol"><Icon name="file" size={27}/></span><h2>One rulebook.<br/>A shared reference.</h2><p>The weights you define here are the weights students see beside their calculation.</p><div className="rule-aside-path"><span><Icon name="university" size={18}/>You define the rules</span><Icon name="down" size={16}/><span><Icon name="lock" size={18}/>A version preserves them</span><Icon name="down" size={16}/><span><Icon name="chart" size={18}/>Students inspect the same rules</span></div><p className="fine-print">Universities set program rules. The central simulator handles preferences and allocation. Publishing uses the university’s configured account to record and lock a rules reference on the blockchain.</p></aside></div>
    </div>
  );
}
function Simulation({
  session,
  programs,
  refresh,
}: {
  session: Session;
  programs: PublicProgram[];
  refresh: () => Promise<void>;
}) {
  type Applicant = {
    id: string;
    scores: Record<string, number>;
    curriculum: string;
    preferences: string[];
  };
  type Payload = {
    runId: string;
    programIds: string[];
    applicants: {
      id: string;
      scores: import("./domain/models").ScoreRecord[];
      preferences: string[];
      qualifications: Record<string, string>;
    }[];
  };
  const [selected, setSelected] = useState<string[]>([]),
    [students, setStudents] = useState<{ id: string; name: string }[]>([]),
    [applicants, setApplicants] = useState<Applicant[]>([]),
    [preview, setPreview] = useState<Record<string, string | null> | null>(
      null,
    ),
    [pending, setPending] = useState<Payload | null>(null),
    [completed, setCompleted] = useState(false),
    [history, setHistory] = useState<
      { runId: string; completedAt: string | null }[]
    >([]);
  const { busy, error, run } = useRequest();
  const load = async () => {
    const [a, b] = await Promise.all([
      api<typeof students>("/office/students", { token: session.token }),
      api<typeof history>("/office/simulations", { token: session.token }),
    ]);
    setStudents(a);
    setHistory(b);
  };
  useEffect(() => {
    void run(load);
  }, []);
  const eligible = programs.filter(
    (p) =>
      p.currentRules !== false && p.rulebook?.institutionId === session.institutionId &&
      p.rulesMatch &&
      p.lockedAt !== "0",
  );
  const chosen = eligible.filter((p) => selected.includes(p.programId)),
    rules = chosen.map((p) => p.rulebook!);
  const components = [
    ...new Map(
      rules.flatMap((r) => r.components.map((c) => [c.scoreId, c] as const)),
    ).values(),
  ];
  const update = (index: number, value: Partial<Applicant>) => {
    if (pending) return;
    setApplicants((old) =>
      old.map((a, i) => (i === index ? { ...a, ...value } : a)),
    );
    setPreview(null);
  };
  const payload = (): Payload => ({
    runId: `run-${crypto.randomUUID()}`,
    programIds: selected,
    applicants: applicants.map((a) => ({
      id: a.id,
      preferences: a.preferences,
      qualifications: { curriculum: a.curriculum },
      scores: components.map((c) => ({
        id: c.scoreId,
        subject: c.label,
        label: c.label,
        maximum: c.maximum,
        score: a.scores[c.scoreId],
        provenance: "simulated-exam-provider",
      })),
    })),
  });
  const process = async (body: Payload) => {
    setPending(body);
    await toast.promise(api("/office/simulations", {
      method: "POST", token: session.token, body,
    }), {
      loading: "Processing admissions… waiting for results.",
      success: "Admissions processed. The results are ready to review.",
      error: errorMessage,
    });
    setCompleted(true);
    await refresh();
    await load();
  };
  return (
    <section className="panel live-panel">
      <h2>Process admissions</h2>
      <p>Fictional applicants. One completed cohort per intake.</p>
      <fieldset disabled={busy || !!pending}>
        <legend>Choose locked programs from the same round</legend>
        {eligible.map((p) => (
          <label className="connected-check" key={p.programId}>
            <input
              type="checkbox"
              checked={selected.includes(p.programId)}
              onChange={(e) => {
                setSelected(
                  e.target.checked
                    ? [...selected, p.programId]
                    : selected.filter((id) => id !== p.programId),
                );
                setApplicants([]);
                setPreview(null);
              }}
            />
            {p.rulebook!.programName} · {p.rulebook!.round}
          </label>
        ))}
      </fieldset>
      {rules.length ? (
        <>
          <button
            className="button button-secondary"
            disabled={busy || !!pending || applicants.length >= 100}
            onClick={() => {
              setApplicants([
                ...applicants,
                {
                  id: "",
                  scores: {},
                  curriculum: "Science–Mathematics",
                  preferences: rules.map((r) => r.programId),
                },
              ]);
              setPreview(null);
            }}
          >
            Add fictional applicant
          </button>
          {applicants.map((a, index) => (
            <fieldset
              className="live-cohort"
              key={index}
              disabled={busy || !!pending}
            >
              <legend>Applicant {index + 1}</legend>
              <Field label={`Student account ${index + 1}`}>
                <select
                  aria-label={`Student account ${index + 1}`}
                  value={a.id}
                  onChange={(e) => update(index, { id: e.target.value })}
                >
                  <option value="">Choose a student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.id}
                    </option>
                  ))}
                </select>
              </Field>
              {components.map((c) => (
                <Field key={c.scoreId} label={`${c.label} / ${c.maximum}`}>
                  <input
                    type="number"
                    min={0}
                    max={c.maximum}
                    step="any"
                    value={Number.isFinite(a.scores[c.scoreId]) ? a.scores[c.scoreId] : ""}
                    onChange={(e) =>
                      update(index, {
                        scores: {
                          ...a.scores,
                          [c.scoreId]: e.target.valueAsNumber,
                        },
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="Curriculum">
                <select
                  value={a.curriculum}
                  onChange={(e) =>
                    update(index, { curriculum: e.target.value })
                  }
                >
                  <option>Science–Mathematics</option>
                  <option>Arts–Languages</option>
                </select>
              </Field>
              <div className="connected-preferences">
                <strong>Ranked preferences</strong>
                {a.preferences.map((id, rank) => (
                  <div key={id}>
                    <span>
                      {rank + 1}.{" "}
                      {rules.find((r) => r.programId === id)?.programName}
                    </span>
                    <button
                      className="text-button"
                      disabled={rank === 0}
                      onClick={() => {
                        const order = [...a.preferences];
                        [order[rank - 1], order[rank]] = [
                          order[rank],
                          order[rank - 1],
                        ];
                        update(index, { preferences: order });
                      }}
                    >
                      Move up
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setApplicants(applicants.filter((_, i) => i !== index));
                  setPreview(null);
                }}
              >
                Remove applicant
              </button>
            </fieldset>
          ))}
          <div className="live-actions">
            <button
              className="button button-secondary"
              disabled={busy || !!pending || !applicants.length}
              onClick={() =>
                void run(async () => {
                  const body = payload();
                  if (
                    body.applicants.some(
                      (a) =>
                        !a.id ||
                        a.scores.some((s) => !Number.isFinite(s.score)),
                    )
                  )
                    throw new Error(
                      "Choose each student and complete every score.",
                    );
                  if (
                    new Set(body.applicants.map((a) => a.id)).size !==
                    applicants.length
                  )
                    throw new Error("Each student can appear only once.");
                  if (
                    rules.some(
                      (r) =>
                        r.academicYear !== rules[0].academicYear ||
                        r.round !== rules[0].round,
                    )
                  )
                    throw new Error(
                      "Choose programs from the same year and round.",
                    );
                  setPreview(allocatePreview(rules, body.applicants, {scorePrecision:programs.some(p=>p.protocolVersion===2)?"hundredths-half-up":"unrounded"}));
                })
              }
            >
              Preview allocation
            </button>
            {preview && !pending ? (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Record these fictional admission results on chain? This intake can be processed only once.",
                    )
                  )
                    void run(() => process(payload()));
                }}
              >
                Process and record results
              </button>
            ) : null}
            {pending && !completed ? (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void run(() => process(pending))}
              >
                Retry saved request
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {preview ? (
        <div className="allocation-preview-result">
          <h3>Allocation preview</h3>
          {Object.entries(preview).map(([id, assigned]) => (
            <p key={id}>
              {students.find((s) => s.id === id)?.name ?? id}:{" "}
              {assigned
                ? rules.find((r) => r.programId === assigned)?.programName
                : "Not admitted"}
            </p>
          ))}
          <p className="fine-print">
            Local calculation. Score authenticity and allocation fairness are
            not independently verified.
          </p>
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      {completed ? (
        <p role="status">
          Results are saved and recorded. Students can now sign in on another
          device.
        </p>
      ) : null}
      <details>
        <summary>Saved processing runs</summary>
        {history.map((h) => (
          <p key={h.runId}>
            {h.runId} · {h.completedAt ? "Completed" : "Pending"}
            {!h.completedAt ? (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const body = await api<Payload>(
                      `/office/simulations/${h.runId}`,
                      { token: session.token },
                    );
                    await process(body);
                  })
                }
              >
                Resume run
              </button>
            ) : null}
          </p>
        ))}
      </details>
    </section>
  );
}
function IssueWizard({
  session,
  programs,
  results,
  refresh,
}: {
  session: Session;
  programs: PublicProgram[];
  results: OfficeResult[];
  refresh: () => Promise<void>;
}) {
  const [programId, setProgramId] = useState(""),
    [step, setStep] = useState(0),
    [chosen, setChosen] = useState<string[]>([]),
    [done, setDone] = useState<string[]>([]);
  const { busy, error, run } = useRequest();
  const program = programs.find((p) => p.programId === programId);
  const ready = results.filter(
    (r) =>
      r.programId === programId &&
      r.outcome === "admitted" &&
      r.confirmationRequestedAt &&
      !r.credential && (program?.protocolVersion !== 2 || r.scoring?.some(e=>e.programId===programId && e.status==="verified" && e.eligible)),
  );
  return (
    <div className="connected-issuance">
      <div className="live-steps">
        {["Choose program", "Import confirmed students", "Review & issue"].map(
          (label, i) => (
            <button
              key={label}
              disabled={busy || i > step}
              className={i === step ? "active" : ""}
              onClick={() => setStep(i)}
            >
              {i + 1}. {label}
            </button>
          ),
        )}
      </div>
      {step === 0 ? (
        <>
          <Field label="Issuance program">
            <select
              value={programId}
              onChange={(e) => {
                setProgramId(e.target.value);
                setChosen([]);
                setDone([]);
              }}
            >
              <option value="">Choose a program</option>
              {programs
                .filter(
                  (p) => p.rulebook?.institutionId === session.institutionId,
                )
                .map((p) => (
                  <option value={p.programId} key={p.programId}>
                    {p.rulebook!.programName} · {p.rulebook!.round}
                  </option>
                ))}
            </select>
          </Field>
          <button
            className="button button-primary"
            disabled={!programId || busy}
            onClick={() => setStep(1)}
          >
            Continue
          </button>
        </>
      ) : step === 1 ? (
        <>
          <h3>Confirmed students</h3>
          <p>
            Only authenticated confirmations from saved admission results appear
            here.
          </p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void run(refresh)}
          >
            Refresh confirmations
          </button>
          {ready.map((r) => (
            <label className="connected-check" key={r.resultId}>
              <input
                type="checkbox"
                checked={chosen.includes(r.resultId)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, r.resultId]
                      : chosen.filter((id) => id !== r.resultId),
                  )
                }
              />
              {r.studentId}
            </label>
          ))}
          {!ready.length ? (
            <p>No confirmed students are ready for issuance.</p>
          ) : null}
          <button
            className="button button-primary"
            disabled={!chosen.length || busy}
            onClick={() => setStep(2)}
          >
            Review & issue
          </button>
        </>
      ) : (
        <>
          <h3>One last look.</h3>
          <p>
            {program?.rulebook?.programName} · {chosen.length} selected
          </p>
          <p>
            {program?.active} active rights / {program?.capacity} seats ·{" "}
            {program?.issuanceAllowance} issuance allowance
          </p>
          <p className="fine-print">
            The contract checks authorization, confirmation and capacity for
            every token.
          </p>
          <button
            className="button button-primary"
            disabled={
              busy ||
              !chosen.length ||
              chosen.length > (program?.issuanceAllowance ?? 0) ||
              chosen.length > (program ? program.capacity - program.active : 0)
            }
            onClick={() => {
              if (confirm(`Issue ${chosen.length} admission tokens on chain?`))
                void run(async () => {
                  try {
                    for (const id of chosen) {
                      if (done.includes(id)) continue;
                      await api(`/issuer/results/${id}/issue`, {
                        method: "POST",
                        token: session.token,
                      });
                      setDone((old) => [...old, id]);
                    }
                    setChosen([]);
                    toast.success("Selected admission tokens issued. The network has confirmed them.");
                  } finally {
                    await refresh();
                  }
                });
            }}
          >
            {busy ? "Waiting for chain…" : `Issue ${chosen.length} tokens`}
          </button>
          {done.length ? (
            <p role="status">{done.length} admission tokens issued.</p>
          ) : null}
        </>
      )}
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

function University() {
  const { session, save } = useSession("institution");
  const [tab, setTab] = useState<"rules" | "process" | "issue">("rules"),
    [editing, setEditing] = useState<AdmissionRulebook | null>(null),
    [editRevision, setEditRevision] = useState(0);
  const [zkEnabled,setZkEnabled] = useState(false);
  const [drafts, setDrafts] = useState<
    { rule: AdmissionRulebook; revision: number }[]
  >([]);
  const [programs, setPrograms] = useState<PublicProgram[]>([]),
    [results, setResults] = useState<OfficeResult[]>([]),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const { busy, error, run } = useRequest();
  const refresh = async () => {
    try {
      const [p, r, workspace, capabilities] = await Promise.all([
        api<PublicProgram[]>("/public/programs"),
        api<OfficeResult[]>("/office/results", { token: session!.token }),
        api<{ drafts: { rule: AdmissionRulebook; revision: number }[] }>(
          "/office/workspace",
          { token: session!.token },
        ),
        api<{scoringProofs:boolean}>("/public/capabilities"),
      ]);
      setZkEnabled(capabilities.scoringProofs);
      setPrograms(p);
      setResults(r);
      setDrafts(workspace.drafts);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) save(null);
      throw e;
    }
  };
  useEffect(() => {
    if (session) void run(refresh);
  }, [session]);
  if (!session) return <SignIn role="institution" onLogin={save} />;
  return (
    <>
      <Heading
        eyebrow={session.institutionId!}
        title="Set the rules. Make them checkable."
      >
        Build clear admission rules. Publish a shared reference.
      </Heading>
      <button
        className="button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await api("/auth/institution/logout", {
              method: "POST",
              token: session.token,
            });
            save(null);
          })
        }
      >
        Sign out
      </button>
      {error ? <Alert>{error}</Alert> : null}
      <nav className="connected-tabs" aria-label="University workspace">
        {(
          [
            ["rules", "Program rulebooks"],
            ["process", "Process admissions"],
            ["issue", "Issue admission tokens"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "rules" ? (
        editing ? (
          <>
            <button
              className="text-button"
              onClick={() => {
                if (
                  confirm(
                    "Leave this editor? Save your draft first to keep changes.",
                  )
                )
                  setEditing(null);
              }}
            >
              ← All rulebooks
            </button>
            <RuleBuilder
              key={editing.id}
              initial={editing}
              initialRevision={editRevision}
              zkEnabled={zkEnabled}
              session={session}
              refresh={refresh}
            />
          </>
        ) : (
          <>
            <div className="section-heading">
              <h2>Program rulebooks</h2>
              <button
                className="button button-primary"
                onClick={() => {
                  setEditing({
                    ...defaultRule(zkEnabled),
                    institutionId: session.institutionId!,
                  });
                  setEditRevision(0);
                }}
              >
                Create rulebook <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="connected-rule-gallery rulebook-programs">
              {programs
                .filter(
                  (p) => p.rulebook?.institutionId === session.institutionId,
                )
                .map((p) => (
                  <article key={p.programId} className="rulebook-program">
                    <div className="rulebook-program-heading"><span className="rule-program-symbol"><Icon name="file" size={24}/></span><div><span>{p.academicYear} · {p.rulebook!.round}</span><h3>{p.rulebook!.programName}</h3></div><Badge tone="green">Published</Badge></div>
                    <p>
                      {p.academicYear} · {p.rulebook!.round}
                    </p>
                    <dl className="detail-list">
                      <div>
                        <dt>Capacity</dt>
                        <dd>{p.capacity} seats</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>{p.rulebook!.version}</dd>
                      </div>
                    </dl>
                    <RuleWeightComposition rule={p.rulebook!} />
                    {zkEnabled && p.currentRules !== false && p.historicalIssued === 0 ? <button className="text-button" onClick={()=>{
                      setEditing({...structuredClone(p.rulebook!),id:`${p.rulebook!.programId}-v${p.rulebook!.version+1}-${crypto.randomUUID()}`,version:p.rulebook!.version+1,status:"draft",createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null});setEditRevision(0);
                    }}>Create amended version <Icon name="arrow" size={15}/></button> : null}
                    {p.currentRules === false ? <p className="fine-print">Historical version. A newer published version applies to this intake.</p> : null}
                    <details>
                      <summary>View rulebook & history</summary>
                      <Json value={p.rulebook} />
                      <ReceiptView value={p.lock} />
                      <p>
                        Published rules are immutable. A changed intake needs a
                        new round.
                      </p>
                    </details>
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setEditing({
                          ...p.rulebook!,
                          id: `rule-${crypto.randomUUID()}`,
                          version: p.rulebook!.version + 1,
                          round: "",
                          status: "draft",
                          createdAt: new Date().toISOString(),
                          sealedAt: null,
                          commitment: null,
                          chainReference: null,
                          publication: null,
                        });
                        setEditRevision(0);
                      }}
                    >
                      Create new version
                    </button>
                  </article>
                ))}
              {drafts
                .filter(
                  (d) => !programs.some((p) => p.rulebook?.id === d.rule.id),
                )
                .map((d) => (
                  <article className="rulebook-program" key={d.rule.id}>
                    <div className="rulebook-program-heading"><span className="rule-program-symbol"><Icon name="file" size={24}/></span><div><span>{d.rule.academicYear} · {d.rule.round}</span><h3>{d.rule.programName}</h3></div><Badge>Draft</Badge></div>
                    <p>
                      {d.rule.academicYear} · {d.rule.capacity} seats · v
                      {d.rule.version}
                    </p>
                    <RuleWeightComposition rule={d.rule} />
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        setEditing(d.rule);
                        setEditRevision(d.revision);
                      }}
                    >
                      Edit rulebook
                    </button>
                  </article>
                ))}
            </div>
            {!programs.length && !drafts.length ? (
              <div className="quiet-empty">
                <Icon name="file" size={28} />
                <h3>Start with one program.</h3>
                <p>
                  Create a rulebook, then set its scoring and eligibility rules.
                </p>
              </div>
            ) : null}
          </>
        )
      ) : null}
      {tab === "process" ? (
        <Simulation session={session} programs={programs} refresh={refresh} />
      ) : null}
      {tab === "issue" ? (
        <section className="panel live-panel">
          <h2>Issue admission tokens.</h2>
          <IssueWizard
            session={session}
            programs={programs}
            results={results}
            refresh={refresh}
          />
          <h3>Manage issued records</h3>
          <button
            className="button"
            disabled={busy}
            onClick={() => void run(refresh)}
          >
            Refresh confirmations
          </button>
          {receipt ? <ReceiptView value={receipt} /> : null}
          {results.length === 0 ? <p>No processed results yet.</p> : null}
          {results.map((record) => (
            <article className="live-result" key={record.resultId}>
              <h3>
                {record.studentId} · {record.outcome}
              </h3>
              <p>
                {record.credential
                  ? `Right: ${record.credential.lifecycle}`
                  : record.outcome === "not_admitted"
                    ? "Result only; no admission right"
                    : record.confirmationRequestedAt
                      ? "Confirmation requested"
                      : "Awaiting student confirmation"}
              </p>
              <p className="live-id">{record.resultId}</p>
              <div className="live-actions">
                {record.outcome === "admitted" &&
                record.confirmationRequestedAt &&
                !record.credential ? (
                  <button
                    className="button button-primary"
                    disabled={busy || (zkEnabled && !record.scoring?.some(e=>e.programId===record.programId && e.status==="verified" && e.eligible))}
                    onClick={() =>
                      void run(async () => {
                        if (
                          !confirm(
                            "Issue this confirmed admission token on chain?",
                          )
                        )
                          return;
                        const response = await api<{
                          issuance: Receipt | null;
                        }>(`/issuer/results/${record.resultId}/issue`, {
                          method: "POST",
                          token: session.token,
                        });
                        setReceipt(response.issuance);
                        toast.success("Admission token issued. The network has confirmed it.");
                        await refresh();
                      })
                    }
                  >
                    {busy ? "Waiting for chain…" : "Issue admission right"}
                  </button>
                ) : null}
                {record.credential ? (
                  <>
                    <a
                      className="button"
                      href={`/verify/${record.credential.credentialId}`}
                    >
                      Public verification
                    </a>
                    {record.credential.lifecycle === "valid" ||
                    record.credential.lifecycle === "enrolled"
                      ? (["enrolled", "withdrawn", "revoked"] as const)
                          .filter(
                            (status) => status !== record.credential!.lifecycle,
                          )
                          .map((status) => (
                            <button
                              className="button"
                              key={status}
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const reason = prompt(
                                    `Reason for ${status} (stored only as a hash on chain):`,
                                  );
                                  if (!reason?.trim()) return;
                                  if (
                                    !confirm(
                                      `Set this credential to ${status}? Withdrawn and revoked rights cannot be restored.`,
                                    )
                                  )
                                    return;
                                  const digest = await crypto.subtle.digest(
                                    "SHA-256",
                                    new TextEncoder().encode(reason),
                                  );
                                  const reasonCommitment =
                                    "0x" +
                                    Array.from(new Uint8Array(digest), (b) =>
                                      b.toString(16).padStart(2, "0"),
                                    ).join("");
                                  const response = await api<{
                                    transaction: Receipt | null;
                                  }>(
                                    `/issuer/credentials/${record.credential!.credentialId}/status`,
                                    {
                                      method: "POST",
                                      token: session.token,
                                      body: { status, reasonCommitment },
                                    },
                                  );
                                  setReceipt(response.transaction);
                                  toast.success(`Admission token ${status}. The network has confirmed the update.`);
                                  await refresh();
                                })
                              }
                            >
                              {status}
                            </button>
                          ))
                      : null}
                  </>
                ) : null}
              </div>
              {record.scoring?.map(evidence => <ScoringEvidenceCard key={evidence.programId} evidence={evidence} busy={busy} onVerify={() => void run(async () => {
                await api(`/office/results/${record.resultId}/scoring`,{method:"POST",token:session.token,body:{programId:evidence.programId}});
                await refresh();
              },{loading:"Generating the private score proof…",success:"The smart contract verified the scoring proof."})}/>)}
              <ReceiptView value={record.issuance ?? record.publication} />
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
export default function LiveApp() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  let page: PageId = "wallet",
    content = <StudentWallet />;
  if (path === "/university") {
    page = "university";
    content = <University />;
  } else if (path === "/transparency") {
    page = "transparency";
    content = <Transparency />;
  } else if (path === "/verify" || path.startsWith("/verify/")) {
    page = "verify";
    content = <Verify />;
  } else if (path !== "/" && path !== "/student/wallet")
    content = <Heading eyebrow="404" title="Page not found" />;
  return (
    <Layout page={page} live>
      {content}
    </Layout>
  );
}
