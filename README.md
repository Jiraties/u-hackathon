# FairPass

FairPass is an admission-result platform with a private student wallet, an institution workspace, and public credential verification. The frontend connects to a TypeScript API, MongoDB, and a Solidity registry on Avalanche.

Students do not need MetaMask, a crypto wallet, or AVAX. The server submits transactions using institutional signers.

**This is a hackathon demo with fictional admissions.** It has no official TCAS or examination-provider integration. An on-chain commitment proves that a report matches the recorded version; it does not prove that the scores are authentic or that the allocation was fair.

## Choose your setup

| Goal | Use | What you need |
| --- | --- | --- |
| Run everything on your computer | [Local Docker](#1-local-docker-start-here) | Git and Docker |
| Develop the frontend with hot reload | [Development](#3-frontend-development) | Running Docker stack, Node.js and pnpm |
| Use real public-testnet transactions | [Avalanche Fuji](#5-avalanche-fuji) | Authorized signers, test AVAX and backend configuration |
| Keep the app online when your computer is off | [Public hosting](#6-public-hosting) | VPS, domain and MongoDB Atlas |

The local network is chain **31337**. Fuji is chain **43113**. The public hosting configuration is Fuji-only; this README does not deploy mainnet.

All commands below run from the repository root unless a step says otherwise. Use a POSIX shell on macOS/Linux, or WSL2 on Windows.

## 1. Local Docker (start here)

Install Git and Docker with the Compose plugin. On macOS/Windows, start Docker Desktop. Use **Docker Compose 2.24.4 or newer** so the Fuji override also works.

Check your installation:

```sh
git --version
docker version
docker compose version
```

Clone the project and start it:

```sh
git clone --branch api https://github.com/Jiraties/u-hackathon.git
cd u-hackathon

docker compose up -d --build --wait
docker compose --profile tools run --build --rm tools dist/scripts/provision-demo.js
```

The first command starts the frontend, API, MongoDB and local Hardhat chain. It automatically deploys the contract and authorizes the issuer. The second command creates the demo accounts. **You do not need a `.env` file, host Node.js installation, private keys, or AVAX for this setup.**

Open **http://localhost:8080**.

| Account | Sign-in page | ID | Local password |
| --- | --- | --- | --- |
| Institution staff | **For universities** | `demo-office` | `password` |
| Admitted student in the walkthrough | **My wallet** | `demo-pim` | `password` |
| Non-admitted student in the walkthrough | **My wallet** | `demo-narin` | `password` |

Local Docker startup automatically creates these fictional accounts if they are
missing, including after a fresh local chain/database cycle. Existing passwords
are preserved. Staff sign in at `/university`; students use `/student/wallet`.


Provisioning creates accounts only. **No results yet** is expected until you complete the walkthrough below. Running provisioning again preserves existing passwords.

Check the services:

```sh
docker compose ps
curl --fail http://localhost:8080/healthz
curl --fail http://localhost:8080/api/ready
```

`web`, `backend`, `mongo` and `chain` should be healthy. The one-time `init` service should have exited successfully. Readiness should report chain `31337` and a contract address.

The browser reaches the API through `/api`. Backend port `3001` is internal to Docker; use `http://localhost:8080/api`, not `http://localhost:3001`.

### Stop or update the local stack

Stop it temporarily without restarting the local chain:

```sh
docker compose stop web backend
```

Start those services again:

```sh
docker compose start backend web
```

After code changes, rebuild only the API and frontend to preserve the running chain:

```sh
docker compose build backend web tools
docker compose up -d --no-deps backend web
```

**Local chain state is ephemeral.** Stopping/restarting or recreating the `chain` container loses its blockchain state. If that happens, run the full local startup and provisioning commands again. Initialization deploys a new registry and selects a new database when the previous deployment is missing. Previous MongoDB data may still exist, but it is not evidence for the new chain.

`docker compose down` removes containers but retains named volumes. Do not use `down -v` unless you intend to delete the stored database and deployment files.

## 2. Run the complete demo

Use this walkthrough after local setup, or after completing the Fuji setup in section 5. On Fuji, publication, result recording, issuance and lifecycle updates spend **test AVAX**.

1. Open **For universities** and sign in as `demo-office`.
2. Under **Program rulebooks**, choose **Create rulebook**.
3. Enter a program slug such as `demo-engineering`, a program name, faculty, year `2027`, a unique round such as `demo-2027-001`, and capacity `1`. Degree is optional.
4. Continue through **Scoring rules**, leaving TGAT at `100%`. Leave eligibility unrestricted for this example.
5. In **Review rulebook**, inspect the fictional calculation. **Save draft** saves your work to MongoDB and lets you resume from another device.
6. Choose **Publish on Avalanche**, accept the confirmation, and wait for **Rules locked on chain**. In local mode, this writes to Hardhat rather than public Avalanche.
7. Open **Process admissions**. Select the published program. Add `demo-pim` with TGAT `95` and `demo-narin` with TGAT `50` using the student-account selectors.
8. Choose **Preview allocation**, then **Process and record results**, and accept the confirmation. Wait for the saved-results message.
9. In another tab, open **My wallet**, sign in as `demo-pim`, and choose **Check result integrity**. Close the evidence dialog, choose **Request confirmation**, and accept.
10. In the staff tab, open **Issue admission tokens**. Choose the program, continue to **Import confirmed students**, refresh confirmations, and select `demo-pim`.
11. Choose **Review & issue**, issue the selected token, and accept the confirmation. Wait for successful issuance.
12. Refresh Pim’s wallet. Use **View token**, **Verify**, or **Share**. The public link does not include the student’s name or scores.
13. Open **Transparency** to inspect the program’s capacity and registry events. Event history is paginated; use **Load more events** when available.
14. Sign out of the student wallet and sign in as `demo-narin`. The result is **Not admitted**. Use **See why** to inspect the score, pinned rules, eligibility and reported outcome. No admission-right token is issued.

For a second demo, use a **new round**. An intake has one locked rulebook and one processing run. Published rules cannot be edited. If a transaction times out, retry the same request or resume its saved run; do not create a new run ID to bypass the conflict.

For multiple programs, select programs from the same year and round, enter the required scores, and reorder each applicant’s preferences before previewing the allocation.

### Platform flow and storage

```text
Staff creates rules → publishes and locks them
    → processes applicants’ scores and preferences → records results
    → student reads result → admitted student confirms
    → staff issues admission token → student views/verifies/shares it
```

| Location | Stored data |
| --- | --- |
| MongoDB | Accounts/password hashes, drafts, private reports and salts, scores, preferences, processing runs, program metadata and saved receipts |
| Blockchain | Authorized roles, program capacity, rule/result commitments, credential lifecycle and events |
| Browser | UI and signed bearer JWTs in localStorage; sessions persist across browser restarts for seven days by default |

A result attestation and an admission-right token are separate records. An offer or matching result alone does not issue a token.

The live app is the default. To inspect the original fixture-only frontend, open `/student/wallet?preview=1` or `/university?preview=1`. Preview data is separate from the API and never replaces a failed live request. Sample codes such as `FP-2027-00842` work in preview only; live credentials use bytes32 IDs.

## 3. Frontend development

Use Node.js **24**. Install pnpm and frontend dependencies:

```sh
npm install --global pnpm@10.32.1
pnpm install --frozen-lockfile
```

Keep either the local or Fuji Docker stack running on port `8080`, then start Vite:

```sh
npm run dev
```

Open the URL Vite prints, normally **http://localhost:5173**. Vite proxies `/api` to the Docker frontend at `http://127.0.0.1:8080/api`.

If Docker uses another web port:

```sh
DEV_API_TARGET=http://127.0.0.1:18080/api npm run dev
```

If you run Express directly on the host instead of using the Docker API:

```sh
DEV_API_TARGET=http://127.0.0.1:3001 npm run dev
```

Keep `/api` in the target URL when targeting Nginx; omit it when targeting Express directly. Restart Vite after changing this variable. Never put private keys, MongoDB credentials, or machine tokens in `VITE_*` variables.

Build the frontend:

```sh
npm run build:web
```

This checks TypeScript and produces `web/dist/`. Build before serving that directory; generated asset files are not committed.

## 4. Tests

Tests require host Node.js 24. Install the frontend dependencies as shown above, then install backend dependencies:

```sh
npm ci --prefix backend
```

Run the frontend checks and backend/contract tests:

```sh
npm run build:web
npm test
npm test --prefix backend
```

Backend tests compile Solidity and start a temporary MongoDB and local EVM on port **18545**. Keep that port free. The first run downloads a MongoDB binary and needs Internet access. These tests do not need your `.env`, signer keys or AVAX and do not send public-chain transactions.

To include the real browser journey:

```sh
npm exec --prefix backend -- playwright install chromium --only-shell
FAIRPASS_BROWSER_TEST=1 npm test --prefix backend
```

On Linux, if Chromium reports missing system libraries, install them with:

```sh
npm exec --prefix backend -- playwright install --with-deps chromium --only-shell
```

The browser test uses the frontend build from `web/dist/`, publishes rules, processes a cohort, confirms as a student, issues as staff, and verifies the result. It also checks the rejected student, missing/unavailable verification, and desktop/mobile overflow. Screenshots are saved in `backend/cache/connected-*.png`.

## 5. Avalanche Fuji

Fuji is a public testnet. The contract stays on the network when your computer is off, but the web app, API and database still need running servers.

### A. Configure the backend

If `backend/.env` does not exist, create it:

```sh
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

If it already exists, edit it instead of overwriting it. Fill in:

| Variable | Value or purpose |
| --- | --- |
| `CHAIN_ID` | `43113` |
| `RPC_URL` | `https://api.avax-test.network/ext/bc/C/rpc` |
| `CONTRACT_ADDRESS` | The Fuji registry you intend to use |
| `DEPLOYMENT_BLOCK` | Its deployment block |
| `AUTHORITY_PRIVATE_KEY` | Result-authority signer for that registry |
| `ISSUER_PRIVATE_KEY` | Authorized institution signer for that registry |
| `ADMIN_PRIVATE_KEY` | Needed for deployment/bootstrap, not normal API operation |
| `ADMIN_ADDRESS` | Leave blank to use the admin signer during deployment, or supply your intended governance address |
| `ADMIN_API_TOKEN` | Server-side provisioning token; at least 32 characters |
| `INTEGRATION_API_TOKEN` | Separate server-side integration token; at least 32 characters |
| `ISSUER_API_TOKEN` | Separate server-side issuer token; at least 32 characters |
| `DEMO_PASSWORD` | Your demo sign-in password; 12–128 characters |
| `MONGODB_DATABASE` | A database dedicated to this network/registry, for example `fairpass_fuji_demo` |
| `INSTITUTION_ID` | `fairpass-demo` |
| `INSTITUTION_NAME` | `Example University`, or your demo display label |
| `CORS_ORIGIN` | `http://localhost:8080` for the Docker UI; `http://localhost:5173` for Vite development |

Private keys must be `0x` followed by 64 hexadecimal characters. Generate **three different** machine tokens by running this command separately for each token:

```sh
openssl rand -hex 32
```

Keep the remaining example settings unless your environment requires a change. Do not commit `.env` or expose it to the frontend. In the Fuji Docker setup, Compose overrides `MONGODB_URI` to use its internal MongoDB container.

The existing project demo registry is:

```dotenv
CONTRACT_ADDRESS=0x55e5eee9feb02b6e4b534b1b0d1ea8ea61eb2955
DEPLOYMENT_BLOCK=59517556
```

To reuse it, use the existing matching server-side signer configuration and database. Arbitrary new private keys will not be authorized. **This registry uses publicly known Hardhat development keys. It is suitable only for fictional demos, not trusted university issuance or real assets.** Rebuilding the app does not replace or secure those keys.

### B. Deploy a new registry only if you need one

Skip this subsection when retaining the existing registry.

Create separate admin, authority and issuer wallets. Put their keys in `backend/.env` and fund them with test AVAX using the [Avalanche faucet](https://faucet.avax.network/). The admin pays for deployment/authorization; the authority and issuer pay for their later writes.

```sh
npm ci --prefix backend
npm run compile --prefix backend
npm run deploy --prefix backend
```

Copy `CONTRACT_ADDRESS` and `DEPLOYMENT_BLOCK` from the output into `backend/.env`, select a new database for this registry, then authorize the issuer:

```sh
npm run bootstrap --prefix backend
```

If you set `ADMIN_ADDRESS` to a multisig, that multisig must authorize the issuer instead of using the single-key bootstrap. Deployment manifests are written to `backend/deployments/`.

### C. Start the Fuji app

The local and Fuji stacks both use web port `8080`. Stop the local web/API first if they are running:

```sh
docker compose stop web backend
```

Start Fuji and create its accounts:

```sh
docker compose -f compose.yaml -f compose.fuji.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.fuji.yaml --profile tools \
  run --build --rm tools dist/scripts/provision-demo.js
```

Open **http://localhost:8080**. Use `demo-office`, `demo-pim`, and `demo-narin` with the `DEMO_PASSWORD` used when these accounts were first provisioned. Changing `.env` does not reset existing account passwords.

Check the network before writing:

```sh
curl --fail http://localhost:8080/api/ready
```

Expect chain `43113` and your configured contract. Complete the walkthrough in section 2. No local Hardhat node runs in this Fuji stack.

### D. Verify a real credential from the CLI

Copy the full credential ID from the issued token or its verification URL. Replace the value below; do not pass the literal `YOUR_CREDENTIAL_ID`:

```sh
CREDENTIAL_ID='0x_REPLACE_WITH_64_HEXADECIMAL_CHARACTERS'
docker compose -f compose.yaml -f compose.fuji.yaml --profile tools \
  run --rm tools dist/scripts/verify.js "$CREDENTIAL_ID"
```

A credential ID is `0x` plus **64** hex characters. A contract address has only 40 hex characters and is not a credential ID. This CLI reads the configured chain directly without relying on the API’s verification response.

## 6. Public hosting

Use a Linux VPS for the web/API and MongoDB Atlas for the database:

```text
Browser → Caddy HTTPS → web/Nginx → API → MongoDB Atlas
                                      → Avalanche Fuji RPC
```

Your personal computer can be off after this setup. The VPS, Atlas and RPC must remain available. You do not need to run an Avalanche validator or local chain. Blockchain commitments cannot reconstruct your private reports, so MongoDB still needs backups.

### A. Prepare the server and Atlas

1. Create a Linux VPS. A starting point for a demo is 2 vCPU, 4 GB RAM and 25–40 GB disk; this is not a load guarantee.
2. Install Git, Docker Engine and the Compose plugin. Enable Docker at boot. See the [Docker Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).
3. Point a domain’s DNS A record, such as `fairpass.your-domain.com`, to the VPS. Only add an AAAA record if the server also serves that IPv6 address.
4. Open inbound TCP ports **80/443** and restrict SSH access. Do not expose ports `3001`, `8080` or `27017`.
5. Create a MongoDB Atlas cluster, a database user with read/write access to the app database, and an IP access-list entry for the VPS’s outbound IP. The database user is separate from your Atlas login.
6. Copy the Atlas Node.js connection URI. URL-encode special characters in its username/password. Do not allow all IPs by default.

### B. Configure the application on the VPS

Clone a revision containing these setup files and the connected UI:

```sh
git clone --branch api https://github.com/Jiraties/u-hackathon.git
cd u-hackathon
cp hosting.env.example .env.hosting
cp backend/.env.example backend/.env
chmod 600 .env.hosting backend/.env
```

As before, do not overwrite existing environment files. Set `.env.hosting`:

```dotenv
PUBLIC_HOST=fairpass.your-domain.com
ACME_EMAIL=you@your-domain.com
```

`PUBLIC_HOST` is a hostname, without `https://` or a path.

Fill `backend/.env` using the Fuji configuration in section 5, with the correct existing signers/tokens. Replace the database settings with:

```dotenv
MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER/?retryWrites=true&w=majority
MONGODB_DATABASE=fairpass_fuji_demo
```

The hosted Compose file sets the HTTPS CORS origin and trusts exactly the two private proxies, Caddy and Nginx. Do not expose the API directly with that proxy setting.

**Changing the MongoDB URI does not migrate data.** A new database has no accounts, reports or program metadata. To keep existing demo results, migrate the database using subsection E before starting the hosted API. If starting fresh, use a new intake for new results.

### C. Build and start

Use `compose.hosting.yaml` **on its own**. Do not combine it with the local/Fuji Compose files.

```sh
docker compose --env-file .env.hosting -f compose.hosting.yaml config --quiet
docker compose --env-file .env.hosting -f compose.hosting.yaml build backend web tools
docker compose --env-file .env.hosting -f compose.hosting.yaml up -d --wait backend web caddy
```

Caddy obtains and renews HTTPS certificates when DNS and ports are correct. Certificates persist in Docker volumes. This stack uses Atlas and the existing Fuji contract; it does not start local MongoDB or deploy another registry.

For a fresh database, create accounts:

```sh
docker compose --env-file .env.hosting -f compose.hosting.yaml --profile tools \
  run --rm tools dist/scripts/provision-demo.js
```

Check the public app, replacing the example hostname:

```sh
curl --fail https://fairpass.your-domain.com/healthz
curl --fail https://fairpass.your-domain.com/api/ready
```

Open the site from another device, verify the contract/network, sign in, and complete a fictional demo. Then turn off your development computer and check again. A passing local test does not validate the new server’s DNS, TLS or Atlas configuration.

### D. Update the hosted app

Commit and push your intended code to `api` before updating the server. On the VPS:

```sh
git pull --ff-only origin api
docker compose --env-file .env.hosting -f compose.hosting.yaml build backend web tools
docker compose --env-file .env.hosting -f compose.hosting.yaml up -d --no-deps backend web
```

Keep **one API writer per signer wallet**. This is a single-server MVP, not a zero-downtime or highly available deployment. Do not run the old local Fuji writer and hosted writer concurrently with the same signers.

### E. Move the existing MongoDB data to Atlas

Use this only when keeping the old accounts/results. Restore into an **empty** target database, not an active app database.

On the old machine, stop the API writer and wait for in-flight operations to finish. Leave MongoDB running. Replace `ACTUAL_DATABASE_NAME` with `MONGODB_DATABASE` from the old server configuration:

```sh
umask 077
docker compose -f compose.yaml -f compose.fuji.yaml stop backend
docker compose -f compose.yaml -f compose.fuji.yaml exec -T mongo \
  mongodump --db ACTUAL_DATABASE_NAME --archive --gzip > /tmp/fairpass.archive.gz
```

On the VPS, create a private backup directory:

```sh
mkdir -p "$HOME/fairpass-backups"
chmod 700 "$HOME/fairpass-backups"
```

From the old machine, copy the archive there, replacing the SSH user and server address:

```sh
scp /tmp/fairpass.archive.gz YOUR_SSH_USER@YOUR_SERVER_IP:fairpass-backups/
```

Do not add the archive to Git or place it in a web-served directory. On the VPS, install [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/). Create `~/fairpass-backups/atlas-restore.yaml` with your Atlas connection string:

```yaml
uri: "mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER/?retryWrites=true&w=majority"
```

Restrict the configuration file, then restore the archive. Replace the source database name:

```sh
chmod 600 "$HOME/fairpass-backups/atlas-restore.yaml"
mongorestore --config="$HOME/fairpass-backups/atlas-restore.yaml" \
  --archive="$HOME/fairpass-backups/fairpass.archive.gz" --gzip \
  --nsInclude='ACTUAL_DATABASE_NAME.*' \
  --nsFrom='ACTUAL_DATABASE_NAME.*' --nsTo='fairpass_fuji_demo.*'
```

Keep all application collections, including subject mappings, salts, private results and program metadata. Check document counts and IDs before starting the hosted API. Sign in again after migration; copied sessions may remain valid until expiry.

Keep encrypted database backups outside the VPS and test restoration. Choose Atlas backup options for your tier; use scheduled `mongodump` backups if automatic backups are unavailable. Restoring blockchain state alone cannot recover private reports.

## 7. Troubleshooting

| Problem | What to check |
| --- | --- |
| Docker cannot connect | Start Docker Desktop/daemon and run `docker version`. |
| Port 8080 is already in use | Stop the other stack’s web service, or start with `WEB_PORT=18080 docker compose up -d --build --wait` and keep that variable on later Compose commands. |
| Vite `ECONNREFUSED 127.0.0.1:3001` | Docker’s API is internal. Remove the old `DEV_API_TARGET`, or set it to `http://127.0.0.1:8080/api`, then restart Vite. |
| Invalid credentials | Use the correct student/staff page. Local Docker uses the documented local password; Fuji/hosting use the password from initial provisioning. Re-provisioning does not reset it. |
| Session invalid/expired | Sign out and sign in again. Sessions persist across tabs and browser restarts for seven days by default. Sign out revokes the server session. Sign in once after upgrading to JWT authentication. |
| Wallet says **No results yet** | Provisioning creates accounts only. Complete rule publication and result processing for that account. |
| No students ready for issuance | The result must be admitted and the student must request confirmation. Refresh confirmations in the staff workspace. |
| Contract/rules/run conflict | Check network, contract, database and intake. Retry the original payload after timeouts; use a new round only for a new cohort. |
| Verifier rejects an ID | Use the full credential ID, `0x` plus 64 hex characters, or its live verification link. Do not use a contract address, placeholder or preview sample code. |
| Insufficient funds or unauthorized signer | Fund the correct Fuji authority/issuer with test AVAX and verify its role in the configured registry. |
| Atlas connection fails | Check the URI, database-user permissions, encoded password and VPS outbound-IP access entry. |
| HTTPS does not start | Check DNS A/AAAA records, inbound 80/443, and Caddy logs. |
| Docker reports disk full/read-only | Restore disk space and restart Docker if necessary. Preserve named volumes containing your database. |

Inspect logs using the same Compose configuration that started the app:

```sh
# Local
docker compose logs --tail=100 backend web

# Fuji
docker compose -f compose.yaml -f compose.fuji.yaml logs --tail=100 backend web

# Hosted
docker compose --env-file .env.hosting -f compose.hosting.yaml logs --tail=100 backend web caddy
```

Avoid sharing environment files or full resolved Compose output; they can contain secrets. Use `config --quiet` to validate configuration without printing it.

## Repository and limits

| Path | Purpose |
| --- | --- |
| `web/` | English React/TypeScript UI and separate fixture preview |
| `backend/src/` | Authentication, API, MongoDB access and chain gateway |
| `backend/shared/` | Shared rulebook validation, commitments, scoring and allocation |
| `backend/contracts/` | Solidity registry |
| `backend/scripts/` | Deployment, bootstrap, provisioning, verification and demo tooling |
| `backend/test/` | Contract/API/CLI/browser integration tests |
| `docker/` | Container startup, health checks, Nginx and Caddy configuration |
| `compose.yaml` | Full local stack |
| `compose.fuji.yaml` | Fuji override for the local Docker UI/API/MongoDB |
| `compose.hosting.yaml` | Standalone public Fuji deployment with Atlas |

The UI/API/registry support the demonstrated flow. Official score-provider integration, independent allocation-fairness verification, account recovery/MFA and high availability are not implemented. The existing public-key Fuji registry remains a demo limitation even after hosting it. QR scanning is not implemented; code/link verification is available.

Further reference: [API endpoints](backend/API.md), [security boundaries](backend/SECURITY.md), [design standard](DESIGN.md), and [UI/API mapping](docs/reference-ui-api-map.md). These are optional references; the setup steps above are complete without them.

Browser authentication uses signed HS256 JWTs plus revocable MongoDB session records.
Set `SESSION_TTL_SECONDS` to change the default seven-day lifetime (300 seconds to 30 days).
Set `SESSION_JWT_SECRET` to a dedicated random secret of at least 32 characters; if omitted,
a domain-separated signing key is derived from `ADMIN_API_TOKEN`. Keep the key stable across
API restarts. Rotating it invalidates existing JWTs. These settings belong only on the API.
JWT payloads contain an opaque session subject and role, without student identity or scores.

## Private scoring verification (v2)

A real Noir/Barretenberg scoring proof and Solidity verifier are implemented in
[the private-scoring module](docs/zk/README.md). The isolated local demo runs at
http://localhost:8081 using `compose.zk.yaml`; it preserves the original demo on
8080. See the module guide for setup, supported rules, cryptographic guarantees,
actual local gas measurements and the separate Fuji deployment plan. The old
Fuji registry remains v1; no ZK feature is claimed for it. No external v2 deployment
or transaction has been performed.

## Demo World

The guided, keyless local replay is available at `http://localhost:8082/demo`. See [run instructions, verification boundaries and judging script](docs/demo-world/EXPERIENCE.md). Fuji V2 replay remains pending approved deployment; predicted addresses are not presented as deployed contracts.
