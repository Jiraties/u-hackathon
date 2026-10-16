# FairPass Demo World

## Review the running experience

Public replay: http://localhost:8082/demo

Private local presenter UI: http://localhost:8083/university (institution sign-in required). Local demonstration login remains `demo-office` / `password`; never publish this local credential on a write-enabled external service.

The existing applications on 8080 and 8081 were preserved. Demo World has its own chain (18548), database and volumes. Prepared Fuji wallets, scenario definition, circuit, contract ABI and V1 deployment were not changed. No Fuji funding, deployment, role grants or transactions occurred.

## Completion status

| Area | State |
| --- | --- |
| Welcome, four perspectives, five chapters, free exploration | Completed locally |
| Nine students / three programs / six places | Actual persisted local scenario |
| Main scoring claims | 27 real Noir/Barretenberg proofs verified by local V2 |
| Main admission rights | Six real local issued rights |
| Security fixture | Separate local V2 registry; four additional real scoring proofs; two active rights |
| Changed-score experiment | Real Noir constraint check; no submitted transaction |
| Eligibility/capacity experiments | Actual historical eth_call simulations returning ProofRequired / Capacity; no submitted transaction |
| Receipt/code/VK reconciliation and public exporter | Implemented and tested locally |
| Fuji replay | Pending approved deployment and scenario transactions |
| Public live signing | Intentionally unavailable |
| Independent allocation proof | Not implemented; allocation remains an identified authority-run simulation |

## Routes and journey

- `/demo`: welcome and four read-only perspective links.
- `/demo/rules`: select a real scenario program, inspect its committed weights/minima/version/capacity and genuine publication events.
- `/demo/proof`: switch Pim's demonstration record to its public proof representation; distinguish hidden scores from observable program/eligibility references.
- `/demo/allocation`: reveal the actual persisted summary, six seats and three unsuccessful outcomes. This is a summary of reported results, not an animation of on-chain matching.
- `/demo/students`: select any of the nine students. Reuses the existing student wallet, pass, non-admitted result/proof summary and score timeline through a read-only input adapter. No login/session impersonation, confirmation or proof-submission actions are supplied to public visitors.
- `/demo/verify`: three real read-only experiments and inspectable evidence. The conclusion appears only after the relevant checks return rejection.

The existing `/university`, `/student/wallet`, `/verify/:id` and `/transparency` routes remain available. Demo chapter routing uses the existing history router, including Back/Forward and native links.

Reused components: `StudentWallet`, `ResultProofSummary`, `ScoringEvidenceCard`, `RuleWeightComposition`, `ReceiptView`, existing icons/buttons/pass/timeline, and shared scoring/allocation functions. The verbose extra scoring cards are on demand only inside the demo; the main score timeline stays visible. Verification labels derive from actual scoring evidence rather than a hardcoded unverified message.

## Run from a fresh local checkout

From the repository root:

```sh
docker compose -f compose.yaml -f compose.zk.yaml -f compose.demo.yaml up -d --build
docker compose -f compose.yaml -f compose.zk.yaml -f compose.demo.yaml --profile tools run --rm --no-deps tools
```

The second command prepares real local data once, using only local development accounts. It refuses all non-local chains, never loads the prepared Fuji secrets, and refuses to overwrite an existing evidence manifest. It generates random commitment salts/IDs; applicant data/outcomes remain the approved deterministic definition.

After preparation, open http://localhost:8082/demo. Public API requests are GET-only; its server contains no signer wallets. The presenter API is on the private Docker network and its separate UI is loopback-only. Each backend rate-limits requests; the public proxy uses one trusted hop. The localhost Hardhat RPC is for development, not a publicly exposed blockchain service.

For code updates, preserve the chain and Mongo services:

```sh
docker compose -f compose.yaml -f compose.zk.yaml -f compose.demo.yaml up -d --no-deps --build backend presenter web presenter-web
```

Do not recreate a running Hardhat chain merely to refresh the frontend. Its memory is not persistent blockchain storage. A fresh chain must have its own matching database/deployment identity; never mix old receipts into a new run.

## Shared state and evidence

`GET /api/v1/demo/world` is the one snapshot used by all chapters. The backend restricts it to the configured scenario instance and exact approved definition. It checks:

- Nine scoped student/result/credential bindings and all three rulebooks.
- Actual V2 registry and verifier addresses; no predicted-address promotion.
- Runtime code fingerprints and creation transactions against linked compiled artifacts and constructor roles.
- Pinned verification-key fingerprint.
- Successful, canonical-block receipts, event names, log indexes and references.
- Required program, dataset, result, proof and issuance evidence.
- Private report commitments, exact scenario scores/preferences, recorded allocation, current dataset/root/authority/version, and current credential status.

Only explicit fictional data is projected. Passwords, JWTs, private signing keys, examination salts, total salts, Merkle paths and circuit witnesses are excluded. Normal authenticated student proof endpoints retain their established private behavior; Demo World does not call them with visitor identities.

Concurrent requests share one in-flight snapshot; reconciled observations are cached for 15 seconds and retain their observation time. Stale datasets/policies show historical status. Failed reconciliation/RPC access removes verified claims instead of silently serving success. This is not a production load benchmark.

### Standalone exporter

`backend/scripts/export-demo-evidence.ts` collects actual receipts/events in 2,000-block ranges, validates the strict schema, runs the same reconciliation and only then creates a new manifest. It requires keyless `DEMO_READ_ONLY=true`, the correct RPC/registry/database/instance and an actual deployment JSON. Historical exports are never overwritten.

From `backend`, after configuring those read-only variables:

```sh
npm run demo:export -- /path/to/actual-v2-deployment.json /path/to/new-public-manifest.json
```

No signer or transaction is used by this command. It was executed successfully against the running local deployment. Fuji export remains gated on an actual approved Fuji deployment, authorized dataset and completed scenario. Optional security metadata must describe a real isolated guard deployment and historical blocks; absent guard evidence disables those experiments.

## Security playground semantics

Changed score: the server runs the existing Noir circuit against a changed TGAT witness and the original authenticated Merkle membership/total context. Genuine constraint/assertion failure is reported as rejection; operational failure is unavailable. The unchanged score passes. No new proof transaction is generated.

Eligibility: the isolated fixture records an authority-attested offer/confirmation for Dao with a real ineligible score claim. At the recorded block capacity is available, so a read-only issueRight call fails with ProofRequired.

Capacity: after Arun and Pim occupy both places in that guard registry, the eligible, confirmed Narin fixture attempts a third right via historical eth_call. It fails with Capacity.

The main nine-student results are never modified by these experiments. Public requests cannot publish new roots, submit proofs or spend gas. Browser verification compares chain block height before and after the journey.

## Restart and presenter boundary

Restart clears only `fairpass-demo-journey-v1` visitor progression. It never resets database/contract state or deletes evidence. A reset guard prevents an unmounting chapter from writing its old progression back.

The presenter UI reuses the current authenticated university console. Examination-authority publication remains a separate CLI role. Do not expose its key, the admin key, or an institution session through the public demo. Fine-grained presenter jobs and a dedicated authority UI remain future additions. Existing issuance/publication idempotency remains in the normal application; the one-time local preparation script intentionally does not pretend interrupted multi-contract security preparation is automatically resumable.

## Fresh verification performed

- Backend TypeScript, circuit compilation and Solidity compilation.
- Integrated suite with both existing browser journeys plus real world reconciliation, tampered code/VK/events, unavailable RPCs, stale datasets, privacy projection and no-public-write checks.
- Frontend scoring/router tests and production build.
- Dedicated full Demo World browser journeys at 1440, 768 and 390 pixels, including reduced motion, six seat assignments, Narin/Pim wallets, selector persistence, three actual guard checks, restart, unavailable evidence and no API mutation requests.
- Keyless exporter against the actual local stack.
- Design source lint and browser inspection. No overflow in six views at desktop/mobile; no browser runtime errors. Final inspector: zero failures, one intentional warning about restrained motion.

The final test counts and captures are recorded in VALIDATION.md. No old result is represented as a newly executed test.

## Three-minute judging script

- **0:00–0:20 — Welcome.** “Nine students, six places. Anyone can inspect the evidence without a wallet.” Start the story.
- **0:20–0:45 — Rules.** Inspect the 20/50/30 Computer Engineering weights and subject minima. Open one genuine rule receipt.
- **0:45–1:15 — Privacy.** Reveal Pim's public proof. “The chain checks the proof; it doesn't receive her raw scores.” Point out the honest local-chain label.
- **1:15–1:40 — Allocation.** Reveal the six recorded places. “Meeting the minimums isn't the same as winning a seat.” Select Narin.
- **1:40–2:10 — Students.** Show Narin's eligible-but-unselected result and 73.80 CE score. Switch to Pim's issued pass, then Dao's minimum failure if time permits.
- **2:10–2:55 — Checks.** Change TGAT, run the eligibility guard, then capacity. “These are real circuit and read-only contract checks, not transactions submitted by visitors.”
- **2:55–3:00 — Close.** “The rules were published. The math was verified. The limits were enforced.” Full allocation remains authority-run, not independently proven.

## Fuji gate and known limits

Nothing here authorizes Fuji funding or transactions. Use the prepared secure role accounts and reviewed `fuji-plan.json` only after explicit approval. Keep V1 untouched. Deploy V2 and prepare its real records, then export/reconcile the actual manifest. A live mutable sandbox needs another registry/database because dataset roots are global per registry/year/round.

The prepared main deployment gas plan excludes the additional guard registry and its fixture transactions. Those need a separate reviewed gas/role plan before external use. Current history/RPC availability determines whether historical guard calls can be replayed; failures are shown as unavailable.

No full-allocation proof, real-world examination truth guarantee, student identity proof or zero-linkability claim is made. Public program associations/eligibility remain observable. Production hosting/TLS, presenter secret operations and load testing are not performed by this local task.
