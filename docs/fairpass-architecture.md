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
fallback. The public program selector uses local fixtures only. UI state resets
on refresh, apart from the credential code represented in the verification URL.
There is no claim that demo interactions are persisted to a backend.

The presentation is desktop-focused. Google Fonts provides the existing DM Sans
and Libre Franklin families with local sans-serif fallbacks. Graphics use local
SVG icons and CSS; no additional dependencies or image services were introduced.

The unrelated Contain/Sepolia implementation and Solidity files have been removed.
The frontend retains only typed interfaces for future integrations, not backend implementations.
