import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  examComponents,
  validateRulebook,
  rulebookCommitment,
  type AdmissionRulebook,
} from "./domain/rulebooks";

function useSession(role: "student" | "institution") {
  const key = `fairpass-session-${role}`;
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(key) ?? "null",
      ) as Session | null;
      return saved && Date.parse(saved.expiresAt) > Date.now() ? saved : null;
    } catch {
      return null;
    }
  });
  const save = (value: Session | null) => {
    setSession(value);
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* Memory session remains usable. */
    }
  };
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => save(null),
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);
  return { session, save };
}
function useRequest() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
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
    <p className="eyebrow">{eyebrow}</p>
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
            placeholder={role === "student" ? "e.g. demo-pim" : "e.g. demo-office"}
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
          <>University staff? <a href="/university">Sign in for universities</a>.</>
        ) : (
          <>Student? <a href="/student/wallet">Sign in to My wallet</a>.</>
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
    [proof, setProof] = useState<Proof | null>(null);
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
    if (session) void run(refresh);
    else {
      setWallet(null);
      setProof(null);
    }
  }, [session]);
  if (!session) return <SignIn role="student" onLogin={save} />;
  return (
    <>
      <Heading
        eyebrow="YOUR PRIVATE ACCOUNT"
        title={wallet ? `Welcome, ${wallet.student.name}` : "My wallet"}
      >
        Results and admission rights are separate records.
      </Heading>
      <button
        className="button"
        onClick={() =>
          void run(async () => {
            await api("/auth/logout", { method: "POST", token: session.token });
            save(null);
          })
        }
        disabled={busy}
      >
        Sign out
      </button>
      {error ? <Alert>{error}</Alert> : null}
      {busy ? (
        <p role="status">Checking saved records and chain state…</p>
      ) : null}
      {wallet ? (
        <>
          <Network value={wallet} />
          {wallet.records.length === 0 ? (
            <section className="panel live-panel">
              <h2>No results yet</h2>
              <p>
                Your institution has not published a result for this account.
              </p>
            </section>
          ) : (
            wallet.records.map((record) => (
              <section className="panel live-panel" key={record.resultId}>
                <p className="eyebrow">
                  {record.report.academicYear} · {record.report.round} ·{" "}
                  {record.report.source}
                </p>
                <h2>
                  {record.report.outcome === "admitted"
                    ? "Admission offered"
                    : "Not admitted"}
                </h2>
                <p>
                  {record.credential
                    ? `Admission right: ${record.credential.lifecycle}`
                    : record.confirmationRequestedAt
                      ? "Confirmation requested. Waiting for institution issuance."
                      : record.report.outcome === "admitted"
                        ? "Confirm your intention before the institution issues your right."
                        : "This result attestation does not grant an admission right."}
                </p>
                {record.report.programId ? (
                  <p className="live-id">Program: {record.report.programId}</p>
                ) : null}
                <p className="live-id">Result: {record.resultId}</p>
                {record.report.rulebooks ? (
                  <ul>
                    {record.report.rulebooks.map((r) => (
                      <li key={r.id}>
                        {r.programName} · rules v{r.version} · {r.capacity}{" "}
                        seats
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="live-actions">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setProof(
                          await api<Proof>(
                            `/me/results/${record.resultId}/proof`,
                            { token: session.token },
                          ),
                        ),
                      )
                    }
                  >
                    Check result integrity
                  </button>
                  {record.report.outcome === "admitted" &&
                  !record.confirmationRequestedAt &&
                  !record.credential ? (
                    <button
                      className="button button-primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/me/results/${record.resultId}/confirm`, {
                            method: "POST",
                            token: session.token,
                          });
                          await refresh();
                        })
                      }
                    >
                      Request confirmation
                    </button>
                  ) : null}
                  {record.credential ? (
                    <a
                      className="button button-primary"
                      href={`/verify/${record.credential.credentialId}`}
                    >
                      Verify admission right
                    </a>
                  ) : null}
                </div>
                <ReceiptView value={record.issuance ?? record.publication} />
                <Json
                  value={record.report}
                  label="Private scores and pinned rules"
                />
                {proof?.resultId === record.resultId ? (
                  <div className="live-proof">
                    <h3>
                      Result integrity: {proof.verification.resultIntegrity}
                    </h3>
                    <p>
                      Score authenticity: {proof.verification.scoreAuthenticity}{" "}
                      · Allocation correctness:{" "}
                      {proof.verification.allocationCorrectness}
                    </p>
                    <p>
                      Integrity compares your private record with its on-chain
                      commitment. It does not authenticate scores or prove a
                      fair allocation.
                    </p>
                    <Json value={proof} />
                  </div>
                ) : null}
              </section>
            ))
          )}
        </>
      ) : null}
    </>
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
    if (!bytes32.test(value.trim()))
      throw new Error(
        "Enter a credential ID: 0x followed by 64 hexadecimal characters.",
      );
    try {
      setCredential(
        await api<Credential>(`/public/verify/${value.trim().toLowerCase()}`),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else throw e;
    }
  };
  useEffect(() => {
    if (initial) void run(() => verify(initial));
  }, []);
  return (
    <>
      <Heading eyebrow="PUBLIC REGISTRY" title="Verify an admission right">
        Check a credential against the configured contract. No student identity
        or scores are disclosed.
      </Heading>
      <section className="panel live-panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => verify(id));
          }}
        >
          <Field label="Credential ID">
            <input
              disabled={busy}
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setCredential(null);
                setMissing(false);
              }}
              placeholder="0x…"
              required
              spellCheck={false}
            />
          </Field>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Checking chain…" : "Verify credential"}
          </button>
        </form>
        {error ? <Alert>{error}</Alert> : null}
        {missing ? (
          <p role="status">Credential not found on this registry.</p>
        ) : null}
        {credential ? (
          <div aria-live="polite">
            <h2>
              {credential.lifecycle === "enrolled"
                ? "Enrolled"
                : credential.status === "valid"
                  ? "Valid admission right"
                  : credential.status === "withdrawn"
                    ? "Withdrawn"
                    : "Revoked"}
            </h2>
            <p>
              Issuer currently authorized:{" "}
              {credential.issuerCurrentlyAuthorized ? "Yes" : "No"}
            </p>
            <p className="live-id">Issuer: {credential.issuer}</p>
            <p className="live-id">Program: {credential.programId}</p>
            <p>
              Academic year: {credential.academicYear} · Holder identity has not
              been verified.
            </p>
            <Network value={credential} />
            <Json value={credential} />
          </div>
        ) : null}
      </section>
    </>
  );
}
function Transparency() {
  const [programs, setPrograms] = useState<PublicProgram[]>([]),
    [selected, setSelected] = useState(""),
    [events, setEvents] = useState<EventPage | null>(null);
  const { busy, error, run } = useRequest();
  useEffect(() => {
    void run(async () =>
      setPrograms(await api<PublicProgram[]>("/public/programs")),
    );
  }, []);
  const loadEvents = async (program: string, from?: string) => {
    const page = await api<EventPage>(
      `/public/programs/${program}/events${from ? `?fromBlock=${from}` : ""}`,
    );
    setSelected(program);
    setEvents((old) =>
      from && selected === program && old
        ? { ...page, events: [...old.events, ...page.events] }
        : page,
    );
  };
  return (
    <>
      <Heading eyebrow="PUBLIC TRANSPARENCY" title="Every seat, accounted for">
        Capacity and lifecycle counters are read from the chain. Fictional
        result processing is labelled separately.
      </Heading>
      {error ? <Alert>{error}</Alert> : null}
      {busy ? <p role="status">Loading chain evidence…</p> : null}
      {!busy && !programs.length && !error ? (
        <p>No programs have been registered in this backend.</p>
      ) : null}
      {programs.map((program) => (
        <section className="panel live-panel" key={program.programId}>
          <p className="eyebrow">
            {program.academicYear} · {program.rulebook?.round ?? "Legacy rules"}
          </p>
          <h2>{program.rulebook?.programName ?? "Registered program"}</h2>
          <div className="live-counters">
            <div>
              <strong>
                {program.active} / {program.capacity}
              </strong>
              <span>Active rights / capacity</span>
            </div>
            <div>
              <strong>{program.historicalIssued}</strong>
              <span>Total issued</span>
            </div>
            <div>
              <strong>{program.issuanceAllowance}</strong>
              <span>Issuance allowance</span>
            </div>
          </div>
          <p>
            Rules:{" "}
            {program.lockedAt !== "0" && program.rulesMatch
              ? "Locked; saved payload matches chain commitment"
              : "Not verified against locked rules"}
          </p>
          <p className="live-id">Program: {program.programId}</p>
          <Network value={program} />
          <ReceiptView value={program.lock} />
          <div className="live-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void run(() => loadEvents(program.programId))}
            >
              View registry events
            </button>
          </div>
          <Json
            value={program.rulebook ?? program.rules}
            label="Published rule payload"
          />
          {selected === program.programId && events ? (
            <div>
              <ol>
                {events.events.map((e) => (
                  <li key={`${e.transactionHash}:${e.logIndex}`}>
                    <strong>{e.event}</strong> · block {e.blockNumber}
                    <p className="live-id">{e.transactionHash}</p>
                  </li>
                ))}
              </ol>
              {events.events.length === 0 ? (
                <p>No events in the scanned block range.</p>
              ) : null}
              {events.nextBlock ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      loadEvents(program.programId, events.nextBlock!),
                    )
                  }
                >
                  Load next block range
                </button>
              ) : (
                <p>Reached the latest scanned block.</p>
              )}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
const defaultRule = (): AdmissionRulebook => ({
  id: `rule-${crypto.randomUUID()}`,
  programId: "demo-engineering",
  institutionId: "fairpass-demo",
  programName: "Fictional Engineering",
  faculty: "Engineering",
  academicYear: 2027,
  round: "demo-1",
  capacity: 1,
  version: 1,
  method: "normalized-weighted-sum",
  components: [
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
function RuleBuilder({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => Promise<void>;
}) {
  const [rule, setRule] = useState<AdmissionRulebook>(() => ({
      ...defaultRule(),
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
  const steps = [
    "Program details",
    "Scoring",
    "Eligibility",
    "Review & publish",
  ];
  useEffect(() => {
    setHash("");
    void rulebookCommitment(rule)
      .then(setHash)
      .catch(() => {});
  }, [rule]);
  const patch = (value: Partial<AdmissionRulebook>) => {
    if (busy || published) return;
    setRule({ ...rule, ...value });
  };
  return (
    <section className="panel live-panel">
      <p className="eyebrow">RULEBOOK · ONE LOCKED VERSION PER INTAKE</p>
      <h2>Build admission rules</h2>
      <div className="live-steps">
        {steps.map((name, index) => (
          <button
            key={name}
            className={step === index ? "active" : ""}
            onClick={() => setStep(index)}
            aria-current={step === index ? "step" : undefined}
          >
            {index + 1}. {name}
          </button>
        ))}
      </div>
      {step === 0 ? (
        <div className="live-grid">
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
          <Field label="Academic year">
            <input
              type="number"
              min="2020"
              max="2100"
              value={rule.academicYear}
              onChange={(e) => patch({ academicYear: Number(e.target.value) })}
            />
          </Field>
          <Field label="Capacity">
            <input
              type="number"
              min="1"
              max="10000"
              value={rule.capacity}
              onChange={(e) => patch({ capacity: Number(e.target.value) })}
            />
          </Field>
        </div>
      ) : null}
      {step === 1 ? (
        <>
          <p>
            Choose components and weights totalling 100%. GPAX uses a 4-point
            scale; exam scores use 100.
          </p>
          {examComponents.map((component) => {
            const selected = rule.components.find(
              (c) => c.scoreId === component.scoreId,
            );
            return (
              <div className="live-component" key={component.scoreId}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={(e) =>
                      patch({
                        components: e.target.checked
                          ? [
                              ...rule.components,
                              {
                                ...component,
                                weightPercent: 1,
                                minimumPercent: null,
                              },
                            ]
                          : rule.components.filter(
                              (c) => c.scoreId !== component.scoreId,
                            ),
                        requiredSubjects: rule.requiredSubjects.filter(
                          (id) => id !== component.scoreId,
                        ),
                      })
                    }
                  />
                  {component.label}
                </label>
                {selected ? (
                  <Field label="Weight %">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="any"
                      value={selected.weightPercent}
                      onChange={(e) =>
                        patch({
                          components: rule.components.map((c) =>
                            c.scoreId === component.scoreId
                              ? { ...c, weightPercent: Number(e.target.value) }
                              : c,
                          ),
                        })
                      }
                    />
                  </Field>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <p>
            Eligibility is checked before ranking; raw scores determine order
            and rounding is for display only.
          </p>
          {rule.components.map((component) => (
            <div className="live-component" key={component.scoreId}>
              <label>
                <input
                  type="checkbox"
                  checked={rule.requiredSubjects.includes(component.scoreId)}
                  onChange={(e) =>
                    patch({
                      requiredSubjects: e.target.checked
                        ? [...rule.requiredSubjects, component.scoreId]
                        : rule.requiredSubjects.filter(
                            (id) => id !== component.scoreId,
                          ),
                    })
                  }
                />
                {component.label} required
              </label>
              <Field label="Minimum % (optional)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={component.minimumPercent ?? ""}
                  onChange={(e) =>
                    patch({
                      components: rule.components.map((c) =>
                        c.scoreId === component.scoreId
                          ? {
                              ...c,
                              minimumPercent:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : c,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ))}
          <Field label="Curriculum">
            <select
              value={rule.qualifications[0]?.equals ?? ""}
              onChange={(e) =>
                patch({
                  qualifications: e.target.value
                    ? [{ field: "curriculum", equals: e.target.value }]
                    : [],
                })
              }
            >
              <option value="">Any curriculum</option>
              <option>Science–Mathematics</option>
              <option>Arts–Languages</option>
            </select>
          </Field>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h3>
            {rule.programName} · {rule.capacity} seats
          </h3>
          <p>
            {rule.academicYear} · {rule.round} · Version {rule.version}
          </p>
          <p className="live-id">
            SHA-256 commitment:{" "}
            {hash || "Complete the fields to calculate a valid commitment."}
          </p>
          {validateRulebook(rule).map((message) => (
            <p key={message} className="live-error">
              {message}
            </p>
          ))}
          <p>
            Publishing registers the program and locks these rules on the
            configured chain. This intake cannot be republished with changed
            rules.
          </p>
          <button
            className="button button-primary"
            disabled={busy || !!published || validateRulebook(rule).length > 0}
            onClick={() =>
              void run(async () => {
                const result = await api<{
                  programId: string;
                  rulesHash: string;
                  lock: Receipt | null;
                }>("/office/rulebooks/publish", {
                  method: "POST",
                  token: session.token,
                  body: rule,
                });
                if (result.rulesHash !== hash)
                  throw new Error(
                    "The returned commitment does not match this rulebook.",
                  );
                setPublished(result);
                await refresh();
              })
            }
          >
            {busy
              ? "Publishing; waiting for chain…"
              : published
                ? "Rules locked"
                : "Publish and lock rules"}
          </button>
          <Json value={rule} label="Complete rule payload" />
        </>
      ) : null}
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
                ...defaultRule(),
                institutionId: session.institutionId!,
              });
              setPublished(null);
              setStep(0);
            }}
          >
            Create another intake
          </button>
        </div>
      ) : null}
      <div className="live-actions">
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
    </section>
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
  const [programId, setProgramId] = useState(""),
    [runId, setRunId] = useState(() => `run-${crypto.randomUUID()}`);
  const [applicants, setApplicants] = useState([
      {
        id: "",
        scores: {} as Record<string, number>,
        curriculum: "Science–Mathematics",
      },
    ]),
    [result, setResult] = useState<unknown>(null);
  const { busy, error, run } = useRequest();
  const rule = programs.find((p) => p.programId === programId)?.rulebook;
  return (
    <section className="panel live-panel">
      <h2>Process fictional results</h2>
      <p>
        This server-side demo is limited to one completed cohort per intake.
        Accounts must already exist. It does not certify official scores or
        allocation fairness.
      </p>
      <Field label="Locked program">
        <select
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            setRunId(`run-${crypto.randomUUID()}`);
            setResult(null);
          }}
        >
          <option value="">Choose a program</option>
          {programs
            .filter(
              (p) =>
                p.rulebook?.institutionId === session.institutionId &&
                p.rulesMatch &&
                p.lockedAt !== "0",
            )
            .map((p) => (
              <option key={p.programId} value={p.programId}>
                {p.rulebook!.programName} · {p.rulebook!.round}
              </option>
            ))}
        </select>
      </Field>
      {rule
        ? applicants.map((applicant, index) => (
            <div className="live-cohort" key={index}>
              <Field label={`Student ID ${index + 1}`}>
                <input
                  value={applicant.id}
                  required
                  onChange={(e) =>
                    setApplicants(
                      applicants.map((a, i) =>
                        i === index ? { ...a, id: e.target.value } : a,
                      ),
                    )
                  }
                />
              </Field>
              {rule.components.map((c) => (
                <Field key={c.scoreId} label={`${c.label} / ${c.maximum}`}>
                  <input
                    type="number"
                    min="0"
                    max={c.maximum}
                    step="any"
                    value={applicant.scores[c.scoreId] ?? ""}
                    onChange={(e) =>
                      setApplicants(
                        applicants.map((a, i) =>
                          i === index
                            ? {
                                ...a,
                                scores: {
                                  ...a.scores,
                                  [c.scoreId]: Number(e.target.value),
                                },
                              }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              <Field label="Curriculum">
                <select
                  value={applicant.curriculum}
                  onChange={(e) =>
                    setApplicants(
                      applicants.map((a, i) =>
                        i === index ? { ...a, curriculum: e.target.value } : a,
                      ),
                    )
                  }
                >
                  <option>Science–Mathematics</option>
                  <option>Arts–Languages</option>
                </select>
              </Field>
            </div>
          ))
        : null}
      <div className="live-actions">
        <button
          className="button"
          disabled={busy || !rule || !!result}
          onClick={() =>
            setApplicants([
              ...applicants,
              { id: "", scores: {}, curriculum: "Science–Mathematics" },
            ])
          }
        >
          Add fictional applicant
        </button>
        <button
          className="button button-primary"
          disabled={
            busy ||
            !rule ||
            !!result ||
            applicants.some(
              (a) =>
                !a.id ||
                rule.components.some((c) => a.scores[c.scoreId] === undefined),
            )
          }
          onClick={() =>
            void run(async () => {
              setResult(
                await api("/office/simulations", {
                  method: "POST",
                  token: session.token,
                  body: {
                    runId,
                    programIds: [programId],
                    applicants: applicants.map((a) => ({
                      id: a.id,
                      preferences: [rule!.programId],
                      qualifications: { curriculum: a.curriculum },
                      scores: rule!.components.map((c) => ({
                        id: c.scoreId,
                        subject: c.label,
                        label: c.label,
                        maximum: c.maximum,
                        score: a.scores[c.scoreId],
                        provenance: "simulated-exam-provider",
                      })),
                    })),
                  },
                }),
              );
              await refresh();
            })
          }
        >
          {busy
            ? "Processing and recording results…"
            : "Process and record results"}
        </button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {result ? (
        <>
          <p role="status">
            Results are saved and recorded. Students can now sign in on another
            device.
          </p>
          <Json value={result} label="Saved simulation run" />
        </>
      ) : null}
    </section>
  );
}
function University() {
  const { session, save } = useSession("institution");
  const [programs, setPrograms] = useState<PublicProgram[]>([]),
    [results, setResults] = useState<OfficeResult[]>([]),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const { busy, error, run } = useRequest();
  const refresh = async () => {
    try {
      const [p, r] = await Promise.all([
        api<PublicProgram[]>("/public/programs"),
        api<OfficeResult[]>("/office/results", { token: session!.token }),
      ]);
      setPrograms(p);
      setResults(r);
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
      <Heading eyebrow={session.institutionId!} title="University workspace">
        Publish rules, process fictional results and issue confirmed admission
        rights.
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
      <RuleBuilder session={session} refresh={refresh} />
      <Simulation session={session} programs={programs} refresh={refresh} />
      <section className="panel live-panel">
        <h2>Results & issuance</h2>
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
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const response = await api<{ issuance: Receipt | null }>(
                        `/issuer/results/${record.resultId}/issue`,
                        { method: "POST", token: session.token },
                      );
                      setReceipt(response.issuance);
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
            <ReceiptView value={record.issuance ?? record.publication} />
          </article>
        ))}
      </section>
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
