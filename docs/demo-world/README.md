# Demo World V2 — implementation preparation

For the approved Fuji deployment and replay hosting boundary, see [FUJI-RELEASE.md](FUJI-RELEASE.md). This preparation report below is historical.

> This is the retained preparation-phase report. For the implemented Demo World, current run instructions and fresh validation, see [EXPERIENCE.md](EXPERIENCE.md) and [VALIDATION.md](VALIDATION.md). The prepared scenario and Fuji plan remain unchanged.

Prepared October 16, 2026. No Fuji transactions, funding, deployments or V1 changes were performed. Existing running Docker applications were not restarted or migrated.

## Implemented and validated locally

- One deterministic definition (`fairpass-demo-world-v1`), nine fictional students, three Kasetsart-inspired fictional programs, three shared subjects, six seats.
- V2 simulations source scores exclusively from the current authorized exam dataset. Saved records are rehashed into a Merkle root before allocation; changed records, missing membership, revoked/expired/unauthorized contexts fail closed. Submitted scores are ignored. Preferences remain authority-supplied simulation inputs, frozen in the persisted run; their real-world completeness/authentication is not proven.
- V2 ranking uses rounded hundredths, half-up, then applicant ID ascending. Shared integer arithmetic is used by TypeScript and the prover; Noir independently constrains the same formula. V1 retains unrounded ranking. The existing frontend preview selects the corresponding mode; no interface was redesigned.
- Dataset/root/version and precision are stored with the allocation run. Retrying a run against a different current dataset is rejected.
- GET-only projections for university, authority, student and verifier. They use explicit fictional fixtures, never production collection dumps and never return JWTs or signing capabilities. Until actual receipts exist they say `not_prepared`, and outcomes are explicitly expected fixture outcomes.
- Strict public evidence manifest schema rejects unknown fields, changed definition digests, cross-registry receipts and pre-deployment blocks. Schema validation does not establish transaction authenticity; that requires RPC reconciliation.
- `DEMO_READ_ONLY=true` blocks every HTTP mutation including sign-in, requires a public `ISSUER_ADDRESS`, rejects issuer/authority private keys and constructs a chain gateway with no signing wallets. Gateway writes reject independently of HTTP routing.
- Four fresh role keys, separate files, permissions 0600 inside a 0700 directory. Git ignored and Docker excluded. Old deployed development accounts and the earlier examination-only key are untouched and are not selected by this plan.

## Roles and custody

See `signers.public.json` for public addresses and relative local secret locations.

| Account | On-chain permission | Custody / use |
| --- | --- | --- |
| Admin / deployer | DEFAULT_ADMIN_ROLE and initial GUARDIAN | Offline deployment/role administration; pause; admin unpause. Default-admin transfer has the existing two-day delay. Never put this key in API services. |
| Allocation authority | RESULT_AUTHORITY | Private presenter service signs admitted/non-admitted result commitments and attestations of authenticated consent. It remains trusted for allocation. |
| Institutional issuer | Authorized institutions mapping, not an AccessControl role | Private presenter service publishes/locks program policies, submits proofs, issues rights and changes lifecycle status. |
| Examination authority | EXAM_AUTHORITY | Independent examination CLI only; commits/revokes datasets. Never put this key in the API service. |
| Public visitor | None | GET-only projections and public verification. No institutional credentials or blockchain signer. |

Keys were generated offline using Viem `generatePrivateKey`, derived and checked for uniqueness, then verified after saving. All four public accounts were read on Fuji with nonce 0 and balance 0; see `fuji-preflight.json`. The earlier secure examination wallet remains unused; this plan uses a fresh dedicated examination account to keep this deployment's custody together.

API machine tokens, a stable JWT secret, non-demo presenter passwords and TLS are additionally required. They are not blockchain accounts. Never publish the local `demo-office/password` login for a write-enabled Fuji service. The presenter service continues to use the existing institution session model; fine-grained university/admissions separation is still future work.

## Contracts and compatibility

Deployment order:

1. RelationsLib.
2. ZKTranscriptLib.
3. Circuit-specific HonkVerifier, linked to those libraries.
4. New FairPassRegistryV2(admin, allocation authority, examination authority, HonkVerifier).
5. Admin authorizes the institutional issuer.

`fuji-plan.json` contains predicted CREATE addresses for fresh admin nonces 0–3, artifact fingerprints, circuit/VK digests and the separate target database. These are predictions, not deployed contract addresses. Incoming funding does not consume admin nonce; any outgoing admin transaction before deployment requires re-planning. Do not blindly rerun a partly completed deployment: inspect public progress receipts and remaining nonces first.

Compiler: Solidity 0.8.28, optimizer 200, Shanghai target. Runtime sizes checked at compilation: registry V2 17,184 bytes; verifier 18,263 bytes; RelationsLib 7,972 bytes; ZKTranscriptLib 6,151 bytes, all below 24,576 bytes. The generated verifier expects 27 application public inputs (its internal count also includes pairing-point inputs).

No circuit or contract redesign was required in this phase. Real local EVM tests exercise the exact generated verifier and registry together, reject a proof from an incompatible actual circuit/VK, and execute all 27 scenario proofs. Fuji execution remains unverified until approved deployment and reconciliation. External deployment execution now rejects signer, bytecode or VK mismatches against the prepared plan and a changed admin nonce.

## Scenario

All programs have capacity 2, academic year 2027, Round 3. Subjects are TGAT, Mathematics 1 and Physics, each scored out of 100. No GPAX/curriculum conditions.

| Program | Weights: TGAT / Math / Physics | Minima: TGAT / Math / Physics |
| --- | --- | --- |
| Computer Engineering (CE) | 20 / 50 / 30% | 50 / 60 / 50 |
| Data Science (DS) | 30 / 50 / 20% | 50 / 55 / 50 |
| Electrical Engineering (EE) | 20 / 30 / 50% | 50 / 55 / 60 |

| Student | Scores: TGAT / Math / Physics | Preferences | Expected outcome |
| --- | --- | --- | --- |
| Arun | 90 / 94 / 89 | CE, DS, EE | CE |
| Pim | 88.25 / 92.50 / 85.75 | CE, DS, EE | CE |
| Mali | 85 / 88 / 80 | CE, DS, EE | DS (second preference) |
| Krit | 82 / 86 / 88 | EE, CE, DS | EE |
| Fah | 80 / 82 / 84 | DS, EE, CE | DS |
| Beam | 78 / 80 / 79 | EE, DS, CE | EE |
| Narin | 72 / 75 / 73 | CE, DS, EE | Eligible, not selected after ranking/capacity |
| Dao | 49 / 93 / 90 | CE, DS, EE | Fails TGAT minimum despite high total |
| Ton | 75 / 49 / 85 | EE, DS, CE | Fails Math minimum |

`scenario.json` records full calculated totals and scoped identifiers for `fuji-replay-001`. Public fictional fixture disclosure is intentional; it must never be generalized into publication of real applicant scores. Production student reports/salts stay private and must never be copied into a public manifest.

## Lifecycle and preparation order after approval

1. Review the exact plan and approve test-AVAX funding / fee ceilings.
2. Fund the four roles with test AVAX. Check chain ID 43113, balances and nonce 0 again.
3. Load keys into their intended processes without shell echo/logging. For the deploy CLI map admin.env PRIVATE_KEY to ADMIN_PRIVATE_KEY, and set ALLOCATION_AUTHORITY_ADDRESS, ISSUER_ADDRESS, EXAM_AUTHORITY_ADDRESS from the public manifest. Keep keys out of Vite, public hosting variables and command text.
4. After explicit approval, run the existing guarded `zk:deploy` path with CONFIRM_ZK_DEPLOYMENT=true. It must match `fuji-plan.json`. Do not reuse the old V1 `.env` signers. Keep all deployment receipts, inspect verifier links and immutable registry verifier, and reconcile actual addresses to the plan.
5. Start a separate V2 presenter API/database, registry address and deployment block. No V1 data migration. Keep public replay separate and keyless.
6. Provision the nine instance-scoped fictional accounts and private examination records. Commit the dataset using the examination-only CLI, after separate root publication approval. Use the same three subjects and preserve random salts; retries reuse the saved dataset.
7. Publish and lock the three scenario rulebooks. Root publication and rule publication can be ordered either way, but both must precede processing. Freeze the preference/cohort definition.
8. Run the authenticated-dataset-backed allocation once with the stable instance run ID. This publishes nine immutable result commitments.
9. Verify three scoring claims per student (27), including genuine ineligible proofs for Dao and Ton. Do not describe this as allocation correctness verification.
10. Record authenticated confirmation and issue only the six offered rights. Preserve unsuccessful applicants' result/scoring evidence with no rights.
11. Build/reconcile a strict evidence manifest from actual receipts/logs/contract reads. Record role addresses, registry/verifier code and VK fingerprints in the deployment evidence, observation block/time, and historical versus current dataset status. Never label fixture expectations as live outcomes.
12. Start the public API with DEMO_READ_ONLY=true, FAIRPASS_LOCAL=false, public ISSUER_ADDRESS, no signer keys and the reviewed DEMO_REPLAY_MANIFEST. Presenter credentials and signer-backed service must not be distributed to visitors. Current normal pages are preserved; future chapter navigation is outside this phase.

Steps 2–10 that create external changes require approval; no execution of them has occurred.

## Isolation and replay

- Definition digest freezes the cohort, policies, algorithm and precision. Instance ID namespaces student/program/run IDs. Random secrets/subjects/results are not derived from public seeds.
- One dedicated registry and separate database serve the prepared replay. A mutable presenter sandbox must use another registry/database, not the replay's year/round dataset context.
- V2 `latestDataset` is global per registry/year/round. A new root can invalidate earlier scoring eligibility; namespaces alone do not isolate roots. Do not publish competing live roots to the replay registry.
- Visitor reset changes chapter/perspective/student selection only. It never changes records, results or chain state.
- Preserve immutable historical manifests. A receipt may remain genuine while its dataset is no longer current. Show both facts independently; a manifest's presence is never sufficient for a verified badge.
- Local chain restarts are disposable new environments; use a new matching database/deployment identity. Never pretend blockchain history was reset.

## Read-only projections

`GET /v1/demo/scenarios/fairpass-demo-world-v1/{university|authority|student|verifier}`.

Current source responses expose preparation fixtures and `writesAllowed:false`, not fabricated prepared evidence. They neither query private production collections nor grant sessions. A supplied strict manifest is explicitly labelled `recorded_evidence_requires_chain_check`. Remaining implementation: receipt/event/code reconciliation and projections of actual prepared result state, including historical block reads. No chapter frontend has been added.

## Local validation and gas

Full command from `backend`: `npm run build && FAIRPASS_BROWSER_TEST=1 FAIRPASS_ZK_BROWSER_TEST=1 node --import tsx --test test/*.test.ts` after the existing `zk:build` and Solidity compile. Result: 16/16 passed, no skips. Includes real local EVM/Mongo, both existing browser journeys, wrong-circuit proofs, replay/eligibility/capacity, modified database rejection, authoritative scores replacing submitted 99s, 27 real scoring verifications and six issued rights. Root `npm test` and frontend build passed. The keyless mode was included in the final integrated run.

See `local-validation.json` for measured gas by operation. Deployment plus authorization: 11,138,078 gas. Full nine-student scenario: 108,108,204 gas. Combined: 119,246,282 gas over 60 expected transactions, excluding optional lifecycle/security demonstrations. Most cost is 27 proof checks. These are local gas measurements, not Fuji receipts or fee quotes. Allow headroom and obtain a fresh fee cap before funding. For illustration only, 119,247,218 gas at 1 gwei is 0.119246282 test AVAX; use actual transaction fee conditions instead of this illustration. Current sampled gas price/nonces are recorded separately and may change.

## Remaining gates

- Explicit approval and execution of funding, deployments, role authorization and all scenario transactions.
- Actual Fuji code/link/receipt reconciliation and proof acceptance.
- Production-safe presenter credentials, TLS/proxy configuration, access restrictions and secret backups.
- A reviewed evidence exporter and actual-state replay projector. The current public endpoints remain preparation fixtures.
- Presenter live-job durability/rate limits if more than a controlled single presenter is expected.
- Allocation remains a trusted authority simulation; report-commitment contents and real student identity are not independently proven by this circuit. Public subjects/program associations remain linkable even though raw scores are hidden.
