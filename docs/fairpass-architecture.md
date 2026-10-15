# FairPass frontend integration boundaries

## Presentation

FairPass has four preserved routes and a simplified shared top navigation. It is
an interactive local frontend. There are no HTTP API requests, live contract reads,
wallet connections, signatures, or blockchain writes.

- `web/src/App.tsx`: route composition and unknown-route fallback.
- `web/src/components/Layout.tsx`: navigation and shared demo disclosure.
- `web/src/components/TokenCard.tsx`: non-transferable admission-pass presentation.
- `web/src/components/VerificationGuide.tsx`: progressively disclosed explanation.
- `web/src/components/BlockchainDetails.tsx`: secondary technical evidence details.
- `web/src/components/ShareTokenButton.tsx`: native dialog and demo link copying.
- `web/src/pages/`: the four presentation experiences, with local UI state.
- `web/src/domain/models.ts`: typed private records, public credentials, and chain references.
- `web/src/data/demo.ts`: fictional records, sample verification cases, and program-scoped events.
- `web/src/services/ports.ts`: preserved backend and registry boundaries.
- `web/src/services/demoVerification.ts`: pure, explicitly simulated lookup; not a PublicRegistry implementation.

The product presentation follows a student-first digital pass rather than a
university dashboard. Native details elements progressively expose exam reports,
verification steps, technical evidence, and demo options. Native dialogs preserve
keyboard focus behavior. Final issuance and camera scanning remain disabled.

## Private backend

Implement `AdmissionsBackend` with authenticated requests. Student identity, exam
scores, and authenticated external confirmation records belong here. FairPass must
not choose applicants. Before admission, the wallet shows exam records, not an
unissued admission token. Local score fixtures are not authenticated attestations.

## Public registry

### Private admission results

`StudentWallet.admission` now distinguishes a confirmed/offered admission from a
`not_admitted` outcome. The latter carries a `PrivateAdmissionResult`, whose
`AdmissionResultAttestation` is a separate type from `PublicCredential` and always
has `grantsAdmissionRight: false`. It is not registered as an admission token or
added to the public demo verifier. The wallet suppresses token presentation for
this outcome even if inconsistent input accidentally attaches a credential.

`AdmissionResultBackend` is a separate authenticated backend boundary for fetching
private result reports. Scores, program preferences, and the result report must
remain behind per-student authorization in a real integration. The demo selector
only switches fictional client-side fixtures; it is not authentication or access
control, and real applicant datasets must not be bundled this way.

Only `PublicResultCommitment` is suitable as a public projection: an opaque
identifier, randomized commitment, and chain reference. It contains no student
identity, score, preference, or reported outcome. The sample commitment is null;
no fingerprint, issuer signature, or chain publication is fabricated.

`calculateProgramScore` reproduces program-specific weighted arithmetic and fails
closed for missing/invalid scores or criteria. Its output is a local calculation,
not authentication or allocation verification. Sample weights are explicitly
fictional and must not be represented as the universities' official criteria.

The three result checks have separate evidence types. `resultCheckState` is only
a presentation guard, not a cryptographic verifier. A future trusted verification
adapter must actually perform the signature, inclusion/commitment comparison, or
allocation recomputation before supplying successful live evidence. The guard
rejects missing, fixture, mismatched, and incomplete evidence. Allocation checks
additionally require complete authenticated inputs and the verified applicable
algorithm. A matching report commitment never implies allocation correctness.

Focused regressions live in `web/scripts/check-admission-results.cjs`. They cover
the three seeded calculations, invalid inputs, evidence gating, privacy projection,
unsuccessful-applicant token isolation, and preservation of admitted rendering.

### Admission token reads

Implement `PublicRegistry` from deployed contract state and events. Capacity,
active-right counts, status, and audit history must eventually come from blockchain
evidence. The demo lookup only reads local fixtures and always identifies results
as simulated. It has valid, withdrawn, revoked, not-found, and unavailable states.
An unavailable check is not equivalent to an invalid token. An unknown local ID
is not a claim about absence from a live registry.

Every seeded credential has `source: "fixture"` and no `chainReference`. The token
card explicitly says it is not verified on-chain. A future integration must replace
that presentation only after an actual verification process, not merely because a
backend supplies a transaction hash or the source field changes.

Audit events have a program ID so changing the selected program cannot show another
program's event history. The displayed events are a partial demonstration history.

## Authorized writes

Implement `RegistryWriter` behind a university-authorized signing flow. The UI now
walks through selecting a program, loading sample confirmations, and reviewing the
proposed active count. The final action remains disabled: no fake transaction,
issuance, or success message is generated. Enforce authorization, capacity, and
lifecycle transitions in the contract. Never put signing secrets in the Vite bundle.

The credential format, issuer governance, complete lifecycle, and privacy commitment
protocol remain design decisions. The current ports are not an approved Solidity ABI.

## Sharing, identity, and privacy

Sharing copies an opaque local credential URL, not student names or exam scores.
It does not provide secure access control or prove the presenter's identity. The
academic wallet is a credential vault and requires no student wallet address.
Tokens are not transferable financial assets or student-owned NFTs in this model.

## Runtime

Vite serves direct routes through its SPA fallback; a future host needs the same
fallback. The public program selector uses local fixtures only. Most presentation state resets on refresh. Versioned local rulebook snapshots and
fictional allocation runs persist in browser storage; run IDs appear in student
preview URLs.
There is no claim that demo interactions are persisted to a backend.

The presentation is desktop-focused. Google Fonts provides the existing DM Sans
and Libre Franklin families with local sans-serif fallbacks. Graphics use local
SVG icons and CSS; no additional dependencies or image services were introduced.

The unrelated Contain/Sepolia implementation and Solidity files have been removed.
The frontend retains only typed interfaces for future integrations, not backend implementations.

## University rulebooks and local allocation

`domain/rulebooks.ts` is the shared schema for program details, normalized score
components (explicit source ID, scale, transformation, weight, optional minimum),
required subjects, curriculum requirements, capacity, year/round and version.
`evaluateRulebook` validates these and calls the existing `calculateProgramScore`
arithmetic function. University sample calculations, the local simulator, and
student traces all use this engine. Invalid/missing inputs or mismatched source
scales fail closed. GPAX can explicitly use a 4-point scale. Custom scoring
methods require another modeled adapter rather than being silently normalized.

`data/rulebooks.ts` supplies shared fictional seeds. `RankedProgramResult` stores
`programId`, `rulebookId` and `rulebookVersion`, with no copied formula. The student
UI resolves that exact combination and refuses to substitute a newer version.
A result attestation remains separate from an admission-right credential.

`canonicalRulebook` serializes the complete decision-bearing configuration in a
fixed property order, sorts set-like arrays, and includes a protocol tag. The
SHA-256 commitment covers identity/version, university/program, faculty, year,
round, capacity, formula, component source IDs/scales/transforms/weights/minimums,
required subjects and curriculum requirements. Publication receipts and UI state
are excluded. This is a frontend preview protocol, not an agreed production ABI.
There is no applicant identity, score or preference in the public rulebook hash.
Private result commitments still require an appropriately randomized design.

`services/ruleWorkspace.ts` stores fictional local previews under
`fairpass-rule-workspace-v1`. A draft can be saved; preparing it clones and seals
that version and computes its commitment. The save boundary rejects overwriting
any sealed historical version. Edits fork to a new version and fresh commitment.
Storage failures are reported. Hydration validates rules and strips chain receipts:
browser storage cannot create authenticated publication state. There is no
production access control or cross-device/cross-tab concurrency guarantee.

The same module contains a small central student-proposing matching simulator:
applicants propose in preference order; programs keep up to capacity, ranking by
their own unrounded score, with ties broken by opaque fictional applicant IDs.
It has a complete synthetic cohort for the three choices in Narin’s seed only.
It is not the official TCAS allocator, nor a verified computation over authentic
applicant inputs. Runs record all rulebook IDs and private assignments locally.
Narin’s non-admitted run link projects those exact versions into the existing
student experience. A simulated offer is shown in the university console without
minting a token or rewriting the admitted wallet. Other programs have no sample
allocation cohort yet. No fairness guarantee follows from local computation.

`components/IssuanceConsole.tsx` preserves the existing issuance interaction as a
secondary workflow. Its preview capacity is derived from the latest prepared
program rulebook; drafts do not change an active preview. The final issue action
remains disabled. Public transparency counts stay labeled seed fixtures; a local
rulebook does not modify a purported live chain registry.

`RuleRegistry` in `services/ports.ts` reserves the reusable versioned registry
boundary and the genuine draft / awaiting-signature / pending / confirmed / failed
transaction states. No implementation is connected, so the UI never advances to a
fake transaction state. Publishing is disabled; local preparation is separate.

Exact integration gaps: deploy and test one authorized append-only Fuji rule
registry, agree the canonical format/ABI and commitment verification, configure
network/address and signer, implement signature/receipt/event/commitment checks,
provide authenticated private source scores and qualifications, supply the agreed
central allocator and complete authenticated inputs, and enforce issuance against
live registry capacity and confirmed admissions. The repo has no backend, contract,
or wallet dependency; this change does not add any.

`web/scripts/check-rulebooks.cjs` includes the original student regressions plus
rule validation, scale/eligibility checks, canonical ordering and independent hash
checks, version isolation, capacity, tie-breaking and preference matching.
