# FairPass — integrated live demo

Default UI uses /api/v1. Open /student/wallet?preview=1 for the original local preview. Preview never substitutes for an unavailable API.

## Vite development with the Docker API

Keep the Docker stack running on port 8080, then run from the repository root:

~~~sh
npm run dev --workspace web
~~~

Vite proxies /api requests to http://127.0.0.1:8080/api by default. Docker's backend port 3001 is internal and is not exposed on the host. If Vite still reports ECONNREFUSED on port 3001, restart Vite and remove any old DEV_API_TARGET override.

For a backend running directly on the host instead of Docker:

~~~sh
DEV_API_TARGET=http://127.0.0.1:3001 npm run dev --workspace web
~~~

For the isolated local Docker stack on port 18080, use DEV_API_TARGET=http://127.0.0.1:18080/api. Keep the /api suffix when targeting Nginx; omit it when targeting Express directly. Do not put backend secrets in frontend environment variables.

## Local Docker

Run from the repository root:

~~~sh
docker compose up -d --build
docker compose --profile tools run --rm tools dist/scripts/provision-demo.js
~~~

Open http://localhost:8080. Local accounts use the DEMO_PASSWORD in compose.yaml.

1. Open **For universities**, sign in as **demo-office**.
2. Build a rulebook with a unique round, capacity 1 and TGAT weight 100%. Review and publish; wait for **Rules locked on chain**.
3. Select the locked program. Add **demo-pim** with TGAT 95 and **demo-narin** with TGAT 50. Process fictional results.
4. In another browser/tab, open **My wallet**, sign in as demo-pim, check result integrity and request confirmation.
5. Refresh confirmations in the institution workspace; issue the admission right.
6. Refresh the wallet and open public verification. Compare the program/credential/contract with Transparency and registry events.
7. Sign in as demo-narin: a saved result attestation is available, with no admission right.

Accounts/results live in MongoDB. Sessions live in sessionStorage per tab, expire after eight hours and are invalidated on sign out. No machine tokens or signing keys are sent to the browser.

One intake has one immutable rulebook and one simulation run. Use a new round for another cohort. Retry the same request after timeouts; do not invent IDs to bypass saved state. The browser processes one program per cohort; the API supports multiple programs and ranked preferences with the same shared engine.

## Fuji

Set backend/.env to CHAIN_ID=43113, the correct RPC/contract/deployment block, unique machine tokens, funded authorized issuer/authority signers, and a database dedicated to this contract. INSTITUTION_ID defaults to fairpass-demo. Set a unique DEMO_PASSWORD with at least 12 characters.

~~~sh
docker compose -f compose.yaml -f compose.fuji.yaml up -d --build
docker compose -f compose.yaml -f compose.fuji.yaml --profile tools run --rm tools dist/scripts/provision-demo.js
~~~

Provisioning creates demo-office, demo-pim and demo-narin, without chain transactions. Existing account passwords are unchanged. UI publication, processing, issuance and lifecycle actions then send real Fuji transactions and spend test AVAX.

Demo decision (16 October 2026): retain the existing Fuji registry at 0x55e5eee9feb02b6e4b534b1b0d1ea8ea61eb2955; do not migrate keys, fund new wallets or deploy a replacement registry.

Its admin, authority and issuer use publicly known Hardhat keys. Other people can sign with those roles. A valid credential and issuerCurrentlyAuthorized=true establish contract state, not that a university actually signed it. Use fictional demo records and do not claim secure institutional key custody. The private-key requirement in Phase 6 remains unmet by this chosen demo setup. Never put machine tokens/private keys in Vite variables.

The full-rulebook protocol works with the existing contract's opaque bytes32 commitment. Legacy programs remain readable but cannot be processed by the full-rulebook simulator. Legacy hashes are not silently migrated.

## Tests

~~~sh
npm ci --prefix backend
npm run build --workspace web
npm test --workspace web
npm test --prefix backend
npm exec --prefix backend -- playwright install chromium --only-shell
FAIRPASS_BROWSER_TEST=1 npm test --prefix backend
~~~

Browser E2E uses Chromium, temporary MongoDB and Hardhat on port 18545. It publishes rules, processes two accounts, confirms as a student, issues as the institution, verifies publicly, checks events and the rejected student's wallet. It sends no public-chain transactions. Screenshots: backend/cache/browser-*.png.

API tests cover role separation, foreign institution rejection, raw near-ties, GPAX, duplicate publication/run/issuance retries, pinned rules, tampered records, 404/503 and mined capacity reverts.

Keep one API writer replica per signer wallet. Public hosting needs HTTPS. Bearer sessions in sessionStorage are an MVP without account recovery/MFA. Fictional institution-supplied simulation inputs are not official scores. Result integrity does not prove score authenticity or allocation fairness.

## Persistence and recovery

After recording results, recreate only API/web:

~~~sh
docker compose up -d --no-deps --force-recreate backend web
~~~

Sign in again and check the same result/credential IDs. Local chain storage is ephemeral: recreating it can require a new deployment/database.

For read-only filesystem/disk exhaustion errors, restore disk space and restart Docker Desktop. Do not delete named volumes: they contain MongoDB records and deployment manifests.

For a recorded fallback, capture a successful run and label playback as a recording. No recording is bundled or claimed as live.

## Repeatable environment checks

From backend/:

~~~sh
node --import tsx scripts/check-docker.ts
# Recreate API/web from the repository root with --no-deps; keep chain/Mongo running.
node --import tsx scripts/check-docker.ts persisted
~~~

The Docker check defaults to http://127.0.0.1:18080/api and refuses all networks except chain 31337. Override DOCKER_TEST_URL for another local port.

With the Fuji Docker stack already running and backend/.env configured, this optional browser check sends fictional transactions on Fuji and records a video:

~~~sh
FAIRPASS_ALLOW_FUJI_DEMO=true node --import tsx scripts/check-fuji-browser.ts
~~~

It rejects mainnet and verifies the API's contract/network against server configuration. It provisions temporary fictional accounts, then performs publication → simulation → confirmation → issuance through the UI. No machine credential is sent to the browser. Public evidence, screenshots and a recorded fallback are saved under backend/cache/fuji-demo/. Video is a recording of a fictional demo, not a live presentation.
