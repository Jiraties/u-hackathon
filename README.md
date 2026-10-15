# FairPass — Your future. Verified.

A student-first academic credential wallet built locally with React, TypeScript,
and Vite. This is an interactive frontend demonstration, not a connected admission
system or a deployed blockchain registry.

The approved visual standard is documented in [DESIGN.md](DESIGN.md). Read it
before making frontend design changes.

## Docker deployment

Run the full local stack with `docker compose up --build -d --wait` and open
`http://localhost:8080`. Includes the existing frontend, API, MongoDB, local EVM,
and automatic contract deployment. Frontend pages retain their existing demo data.
See [DOCKER.md](DOCKER.md) for live API tests and Avalanche Fuji deployment.

## Run locally

```sh
npm run dev
```

Open the localhost URL printed by Vite (normally `http://localhost:5173`).
No environment variables, MetaMask, AVAX, or API credentials are required.
Dependencies are already installed; a fresh checkout can use `pnpm install`.

## Four routes

| Page | Route | Preview behavior |
| --- | --- | --- |
| My wallet | `/student/wallet` (also `/`) | Digital admission pass, token detail dialog, verification link, demo sharing, and expandable exam records |
| University | `/university` | Choose program, load fictional confirmations, review capacity, then see the disabled final issuance action |
| Transparency | `/transparency` | Select a sample program, inspect a capacity visualization and its own sample event timeline |
| Verifier | `/verify` or `/verify/FP-2027-00842` | Enter a token code or link; explore clearly labelled local verification results |

The wallet's **Demo preview options** can display the pre-admission state. It shows
exam records without displaying an issued admission token. Sharing only copies a
local demo verification link. QR scanning and real issuance are not implemented.

The **Explore another applicant’s experience** selector below the wallet switches
between Pim (admitted) and Narin (not admitted). Open the non-admitted sample directly
at `/student/wallet?demo=not-admitted`. Narin has a private result attestation and no
admission-right token. Ranked programs show calculated scores of 60.30, 59.80, and
61.15 using fictional program-specific criteria, with expandable calculations.
Score authenticity and result integrity are not verified; allocation verification
is unavailable. None of these sample records is signed or published on-chain.

Run focused admission-result regression checks with:

```sh
node web/scripts/check-admission-results.cjs
```

## Demo verification examples

- `FP-2027-00842`: active sample / valid in this demo.
- `FP-2027-00818`: withdrawn sample.
- `FP-2027-00804`: revoked sample.
- `FP-NOT-FOUND`: not present in the local sample records.
- `FP-DEMO-OFFLINE`: simulated unavailable verification service.

These results are not blockchain validation. Unknown IDs never receive a positive
result. No real issuer authorization or contract evidence has been checked.

## Scope and data

Thai university names are illustrative. All applicants, exam scores, capacities,
and credential records are fictional. There is no affiliation with the example
universities, official TCAS integration, or deployed FairPass contract.

The academic wallet is a credential vault. It does not imply a student-controlled
crypto wallet or ownership of a transferable NFT. Personal names and exam records
remain separate from public credential models.

The presentation is desktop-focused. No new dependencies were added.

## Build

```sh
npm run build:web
```

This runs TypeScript checking and produces `web/dist/`.

## Integration boundaries

The existing domain models and `AdmissionsBackend`, `PublicRegistry`, and
`RegistryWriter` ports remain in place. Pages receive typed view data through props.
The local demo verifier is explicitly separate from the real public registry port.
See [the architecture notes](docs/fairpass-architecture.md).
