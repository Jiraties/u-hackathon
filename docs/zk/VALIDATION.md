# Validation evidence

Final integrated run: `FAIRPASS_BROWSER_TEST=1 FAIRPASS_ZK_BROWSER_TEST=1 npm test` in `backend` passed **10/10 tests**, no skips. This includes the legacy browser journey and the real ZK browser journey for both outcomes. Frontend `npm test`, TypeScript and `npm run build:web` passed.

The proof test generated and rejected a proof from a different actual Noir circuit/VK, rejected a valid cross-result replay, and checked authorized current roots, program/version binding, modified witnesses, arithmetic/eligibility, confirmation, issuance authorization, duplicates, capacity and ineligible applicants. Both API and browser tests use real private proofs and the generated Solidity verifier.

The isolated Docker ZK stack started successfully on localhost:8081. Its separate fictional examination authority published a dataset root, both applicants obtained actual verified scoring claims, and only the admitted, confirmed applicant received a token. Existing fairpass containers, chain and volumes on port 8080 were preserved.

An older CLI test initially collided with the new demo's port 18547; it now selects an ephemeral API port. The screenshot harness now pauses infinite toast animations instead of calling finish on them. An obsolete assertion for the intentionally removed myTCAS header link was removed without changing that UI. The final full run passed.

No Fuji contracts were deployed and no external blockchain transactions were submitted. The generated examination-authority wallet was not used in any local or external test; local tests use isolated development accounts. Fuji inspection was read-only.

Gas/timing/RSS samples are in MEASUREMENTS.json. The report does not claim combined peak native-prover memory, audited security, real examination authenticity, independently verified allocation fairness, or a completed Fuji deployment.
