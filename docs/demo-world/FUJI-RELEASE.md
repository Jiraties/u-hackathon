# Fuji V2 replay release — October 16, 2026

The user approved funding the prepared role accounts, deploying the separate V2 contracts and preparing the fictional Demo World on Avalanche Fuji (43113). V1's registry and existing application database are preserved.

## Deployment

| Contract | Address |
| --- | --- |
| RelationsLib | `0x65de911db83a8937104f126e8927e3fd484635a6` |
| ZKTranscriptLib | `0x8493494af04674f649c8479b0b75345879add856` |
| HonkVerifier | `0x226ca8ad4e0581ea5d44035a97a30cf398442967` |
| FairPassRegistryV2 | `0x7b312c07b93c420d1c371dccd88fe5a36b4c093b` |

Registry creation transaction: `0x7deb96952a1c694ef7bd31e17868bb052d8fff87c5e70fcd37b7b3b449857e8e`, block 59543215. Verification-key SHA-256: `be399a1f2adfbac473dc05078dd8563c5ce20997b49b260aab8700276b1bba2f`.

The four distinct role addresses remain those reviewed in `fuji-plan.json`. Keys stay in local Git-ignored deployment-secret custody. Each role received 0.001 test AVAX. The runner caps transaction fees at 1,000,000 wei per gas; actual Fuji fees are not a mainnet price estimate.

## Hosting boundary

The existing public Railway URL continues to serve the normal V1 application. Its optional `DEMO_REPLAY_API_URL` forwards only `/api/v1/demo/*` read requests to a private V2 service. Browser session headers and cookies are not forwarded; mutations are rejected.

The replay service uses `DEMO_READ_ONLY=true`, the public issuer address, the separate `fairpass_demo_world_v2_fuji_001` database and instance `fuji-replay-001`. It has no signing keys or public domain. The compressed `FAIRPASS_REPLAY_MANIFEST_GZIP_BASE64` contains only the strict public receipt manifest; runtime materializes it under `/app/deployments` before the API reconciles the receipts, deployed code and current contract state. Private fictional report openings and exam records remain in MongoDB, outside source control and public static files. Institutional login and all writes are blocked in replay mode.

The isolated preparer is a local command-line process, not a public presenter API. Replaying the published scenario requires neither presenter credentials nor browser wallets. Keep the replay registry immutable; another dataset root or rule version can make its evidence stale.

## Verification scope

Each supported scoring proof checks the weighted calculation and eligibility against authenticated examination records without publishing raw scores or identity. Result commitments independently protect the saved result record. Ranking and seat allocation remain an authority-run simulation; no full-allocation correctness proof is claimed.

The original preparation report is retained as historical context. The actual public receipt manifest records the completed release, including the separate guard registry used for read-only eligibility and capacity checks.

## Actual validation

The isolated keyless production API reconciled the manifest against Fuji: state `verified`, nine students, 27 scoring claims, six admission rights and both guard fixtures available. Cold reconciliation took 73.6 seconds from this machine. Read-only replay caches a verified observation for up to five minutes; the evidence dialog displays its observation time. Cache expiry performs reconciliation again and fails closed if the evidence no longer matches. Write-enabled environments retain the existing 15-second cache.

The complete regression suite passed 18/18 with both browser flags enabled. Frontend production build, root frontend checks and production Docker build passed. Existing browser assertions were aligned with the already-merged acceptance and issuance labels.

Actual public receipts: [fuji-evidence.json](fuji-evidence.json). Measured transaction gas: [fuji-gas.json](fuji-gas.json). Several RPC gas estimates were excessively high: Fuji charges at least half the specified gas limit, so these receipts include that waste. They must not be represented as the minimum execution cost or as a mainnet fee quote. Mainnet rollout should bound and validate per-operation gas limits before pricing at scale.

The user separately approved the fictional record transfer. The one-time private Railway importer completed successfully in the separate V2 database. It copied no real students, passwords, sessions or signing keys. The import job has no public domain and restart policy NEVER.

The initial historical guard manifest is retained in `fuji-evidence-historical.json`. Free Fuji providers did not retain its historical state, so the active manifest uses current-state read-only calls. Eligibility has its own unoccupied guard program and ineligible scoring proof; capacity uses the full two-place guard program. This prevents the capacity gate from masking the eligibility gate. Five guard proofs exist separately from the 27 main student-program claims. No archive service is required, and current guard calls send no transactions.

Final keyless API checks returned HTTP 200 for all three experiments: changed score rejected by the actual Noir circuit; current eligibility call reverted `ProofRequired`; current full-capacity call reverted `Capacity`. All returned `submittedTransaction:false`.
