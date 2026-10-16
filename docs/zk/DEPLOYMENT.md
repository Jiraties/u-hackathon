# Fuji deployment plan — not executed

No external contracts have been deployed, permissions granted, assets transferred or transactions submitted. The newly generated examination-authority wallet has not been used to sign any transaction. The user's wallet-generation instruction explicitly prohibits deployment and transactions.

Review [fuji-deployment-plan.json](fuji-deployment-plan.json) for the four contract artifact hashes, circuit VK hash and public role addresses. [exam-authority-public.json](exam-authority-public.json) identifies the new examination signer and its local, ignored key-file path. The key itself is not in this documentation, repository or Docker context.

## What changes after explicit authorization

1. Deploy `RelationsLib` and `ZKTranscriptLib`.
2. Link those addresses into `HonkVerifier` and deploy it. This verifier is specific to the compiled scoring circuit and zero-knowledge EVM target.
3. Deploy `FairPassRegistryV2` with the chosen admin, admissions/allocation authority, new examination authority and verifier address.
4. Authorize the university issuer on the new registry.
5. Verify all deployed code, immutable verifier address, protocol version, roles and issuer authorization through read-only calls.
6. Configure a **separate v2 Mongo database** with `REGISTRY_VERSION=2`, the new registry address and its deployment block. Preserve the v1 registry, private dataset and public verification service.
7. Provision fictional users. Publish a supported rulebook through the university console. The separate examination authority authenticates a fictional dataset and submits its root. Generate a private proof through the authenticated API, check its receipt and demonstrate a deliberately invalid proof rejection.

Existing v1 credentials are not copied, reissued or silently promoted to ZK-verified credentials. A v1 deployment cannot be upgraded in place. Old datasets/rights remain with that registry. Keep its verification endpoint available when presenting historical credentials.

The new registry rejects legacy `registerProgram`/`reviseProgram` paths. Use its versioned scoring-policy publication. Amendments before issuance retain historical versions; after issuance a new intake is required.

## Public roles and key custody

The deployment plan records configured public addresses only. Four distinct roles are required: admin, allocation authority, institutional issuer and examination authority. The exam key belongs to the exam publication CLI, never the web/API process.

**Existing configured admin/authority/issuer signers are publicly known development accounts in the prior fictional Fuji demo. A secure new exam key does not make a registry secure if its admin key is publicly known: that admin could grant another examination-authority role.** Before making a real-world authenticity claim, replace exposed roles with independently controlled secure signers and obtain an appropriate security review. This implementation has not silently changed the previously chosen signers. Any use of them must stay explicitly limited to an insecure fictional demonstration.

Admin pays for contract deployment and issuer authorization. Issuer pays for program publication, score-proof verification and issuance in the current server flow. Examination authority pays for dataset-root publication. Allocation authority pays for result/confirmation attestations. Fund roles with **test AVAX only** after the deployment plan is authorized; no funding was performed here.

## Commands for a later approved deployment

From `backend`, build and inspect the plan:

```sh
npm ci
npm run zk:build
npm run compile
npm run zk:deploy -- --plan
```

The execution command deliberately refuses Fuji unless `CONFIRM_ZK_DEPLOYMENT=true` is set after approval. Do not set it merely to inspect the plan. Mainnet is refused by this script.

After approval and configuration, the execution command is `npm run zk:deploy`. It writes public deployment progress and a manifest under ignored `backend/deployments`. If interrupted, inspect the progress file and actual chain state before retrying; the script does not promise fully resumable deployment or reuse partial deployments automatically.

Set these API variables for the new deployment:

```dotenv
REGISTRY_VERSION=2
CHAIN_ID=43113
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CONTRACT_ADDRESS=<new-v2-registry>
DEPLOYMENT_BLOCK=<new-registry-deployment-block>
MONGODB_DATABASE=<separate-v2-database>
```

Use existing guarded Fuji Compose configuration with the new `.env` values only after migration has been reviewed. `compose.zk.yaml` is local-only and must not be combined with the Fuji override.

### Examination dataset publication

The independent `commit-exams` CLI needs: chain ID, RPC, v2 registry address, database access, `REGISTRY_VERSION=2`, and the exam signer. It does **not** require the API's private signing keys or machine credentials. An external publication refuses to run unless `CONFIRM_EXAM_ROOT_PUBLICATION=true` has been set after that root's publication plan has been approved.

Node's `--env-file=<local-exam-key-file>` can load the ignored examination-only configuration without printing it. Run `scripts/commit-exams.ts` with a private fictional-record JSON file. Do not put the key in shell command text, Vite variables, a public input file, a source file or shared `.env` used by the API container.

The JSON file must contain `fictional: true`, a fresh 32-byte dataset ID, academic year, `Round 1`–`Round 4`, a monotonically increasing dataset version, Unix expiry and private records. Each record contains the provisioned student ID, positive record version and exactly three supported subject scores. The CLI creates fresh salts, constructs the tree, saves private evidence in Mongo and signs only the root metadata. On retry it reuses the persisted dataset rather than generating replacement salts for an existing ID.

Keep source records, mappings, salts, Merkle paths and any witnesses private. Use controlled access, backups and retention. A malformed authority dataset cannot establish truthful scores merely by being signed; authentication still depends on the examination authority's procedures.

## Inspection already completed

The existing Fuji contract `0x55e5eee9feb02b6e4b534b1b0d1ea8ea61eb2955` was inspected on chain 43113 using `eth_getCode` and read-only calls. Its deployed code is 9,507 bytes and it reverts on the v2 version/verifier getters. See the timestamp, block and network gas limit in [fuji-inspection.json](fuji-inspection.json). This is evidence about the existing deployment, not evidence that the new verifier has been deployed on Fuji.

The generated verifier and registry fit standard EVM bytecode limits and have been exercised with actual proofs on local EVMs. Fuji deployment compatibility and real Fuji costs remain to be verified after authorization; local gas measurements do not constitute Fuji receipts.
