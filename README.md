# FairPass — Your future. Verified.

A student-first academic credential wallet built locally with React, TypeScript,
and Vite. This is an interactive frontend demonstration, not a connected admission
system or a deployed blockchain registry.

The approved visual standard is documented in [DESIGN.md](DESIGN.md). Read it
before making frontend design changes.

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
| University | `/university` | Create versioned admission rules, inspect sample scoring, prepare a local version, run fictional allocation, or open secondary credential issuance |
| Transparency | `/transparency` | Select a sample program, inspect a capacity visualization and its own sample event timeline |
| Verifier | `/verify` or `/verify/FP-2027-00842` | Enter a token code or link; explore clearly labelled local verification results |

The wallet's **Demo preview options** can display the pre-admission state. It shows
exam records without displaying an issued admission token. Sharing only copies a
local demo verification link. QR scanning and real issuance are not implemented.

The **Explore another applicant’s experience** selector below the wallet switches
between Pim (admitted) and Narin (not admitted). Open the non-admitted sample directly
at `/student/wallet?demo=not-admitted`. Narin has a private result attestation and no
admission-right token. Ranked programs show calculated scores of 60.30, 59.80, and
61.15 using fictional program-specific criteria, with visual calculations from their pinned rulebooks.
Score authenticity and result integrity are not verified; allocation verification
is unavailable. None of these sample records is signed or published on-chain.

Run focused admission-result regression checks with:

```sh
node web/scripts/check-rulebooks.cjs
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

## Rulebook demo walkthrough

1. Open `/university` and choose **Create rulebook** for Kasetsart Computer Engineering.
2. Configure details, subject scales/weights and eligibility. Weights must total 100%.
3. Review Narin’s calculation and choose **Prepare local preview**. The version is
   fixed and fingerprinted locally; **Publish on Avalanche** stays disabled.
4. Choose **Process admissions**, then **Run local admissions preview**.
5. Open **Inspect Narin’s result**. Each program trace uses the exact rulebook ID
   and version from that run; the Smart contract rules badge opens its evidence.
6. Create a later version to change the rules. Earlier run links retain their
   original versions. Browser-local preview data survives route navigation/reload.

The sample cohort has 145 fictional applicants and three ranked programs at
Chulalongkorn, Kasetsart and Thammasat. Student-proposing matching uses each
program’s unrounded weighted score; ties use fictional applicant IDs. It is not
the official TCAS algorithm and does not establish independently verified fairness.
If altered capacity produces a simulated offer for Narin, the console shows it;
no admission-right token is created. Other program rulebooks support authoring
and score review but do not have a modeled allocation cohort yet.

Rules use `web/src/domain/rulebooks.ts` and the existing shared arithmetic engine.
Local snapshots/runs are in `web/src/services/ruleWorkspace.ts`, under the versioned
browser key `fairpass-rule-workspace-v1`. They are fictional, editable browser
storage, not authenticated blockchain evidence or a production data store.

Remaining integrations: a reusable authorized versioned Fuji rule registry;
contract/address/ABI configuration; signer and real receipt handling; issuer and
commitment verification; authenticated private score/qualification/confirmation
APIs; an agreed allocation algorithm and complete inputs; live issuance/capacity.
The `RuleRegistry` port defines transaction states without fabricating transactions.
No contracts or backend endpoints were introduced. See the architecture notes.
There is no configured lint command; TypeScript validation runs with the build.
