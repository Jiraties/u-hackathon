# Railway: one frontend/API service

Use the repository root (`/`) as the Railway service root. The root `Dockerfile` builds the React frontend, backend, Noir circuit, Solidity artifacts and verifier together. Its production Node process serves the frontend plus `/api` on Railway's `PORT`, bound to `0.0.0.0`. `railway.json` selects that image and `/api/ready` as the health check.

## Service settings

1. Deploy this repository with Root Directory `/` (not `/web` or `/backend`).
2. Use the root `Dockerfile`. Clear old Railpack Build Command and Start Command overrides; the image has its own startup command. Do not use `vite` or `vite preview` as the production server.
3. Add a separate Railway MongoDB service (or an existing managed MongoDB). Set `MONGODB_URI` to its private connection reference and `MONGODB_DATABASE` to the chosen environment database.
4. Set the runtime variables below, generate a Railway domain and set `CORS_ORIGIN` to its exact HTTPS origin. Let Railway supply `PORT`.
5. Deploy the reviewed source. Check `/api/ready`, `/demo`, `/student/wallet` and `/university` on the same domain.

## Runtime configuration

For a public, keyless replay:

| Variable | Value |
| --- | --- |
| `FAIRPASS_LOCAL` | `false` |
| `FAIRPASS_LOAD_DEPLOYMENT` | `false` |
| `DEMO_READ_ONLY` | `true` |
| `RPC_URL` | An accessible RPC for the chosen chain |
| `CHAIN_ID` | `43113` for Fuji |
| `REGISTRY_VERSION` | `2` only for an actually deployed V2 registry; use `1` for V1 |
| `CONTRACT_ADDRESS` | Actual deployed registry address, never a predicted address |
| `DEPLOYMENT_BLOCK` | Actual deployment block number |
| `ISSUER_ADDRESS` | Public institutional issuer address |
| `ADMIN_API_TOKEN` / `INTEGRATION_API_TOKEN` / `ISSUER_API_TOKEN` | Three distinct, random secrets of at least 32 characters each; the existing config requires these even in read-only mode |
| `SESSION_JWT_SECRET` | Stable random secret of at least 32 characters |
| `CORS_ORIGIN` | Exact Railway HTTPS application origin |
| `INSTITUTION_ID` / `INSTITUTION_NAME` | Match the intended database institution |

The image supplies `WEB_DIST_DIR=/app/public`, `HOST=0.0.0.0` and `TRUST_PROXY_HOPS=1`. Do not set issuer or authority private keys in the public replay service. No accounts, deployment, database migration or blockchain transactions run automatically at image build/start.

For a prepared Demo World, also supply `DEMO_WORLD_INSTANCE` and `DEMO_REPLAY_MANIFEST` pointing to the reviewed actual evidence manifest available in the running container, backed by its corresponding database and RPC history. Mount evidence files through a private runtime volume rather than committing applicant records or secret files. V2 Fuji has not been deployed by this change, so the local nine-student proof history does not automatically become Fuji evidence. Without the prepared evidence, Demo World correctly displays pending/unavailable status.

A write-enabled presenter deployment needs separate custody, production account provisioning, authenticated permissions and explicitly approved chain operations. The public read-only mode intentionally rejects sign-in and every HTTP mutation. Do not publish the local `demo-office/password` account on a write-enabled external service. A private presenter service must remain separate from the public keyless replay service.

## Local build validation

```sh
docker build -t fairpass-railway:check .
```

The image deliberately does not bundle MongoDB, Hardhat, local databases, deployment volumes, wallets or `.env` files. Existing `.dockerignore` exclusions apply. An external service cannot reach `localhost` RPC/MongoDB running on your laptop.

## Earlier npm warnings

Backend `allowScripts` is restricted to the four exact dependency versions reported in the install log. Docker installs instead use the established explicit `--ignore-scripts` pipeline and compile the required artifacts themselves.

`Unknown env config "cache-dir"` comes from the build environment rather than this repository (there is no project `.npmrc` defining it). Remove an inherited `npm_config_cache_dir` setting or use the supported `npm_config_cache` setting. Do not add a warning-suppression script to application startup.
