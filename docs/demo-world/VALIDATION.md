# Demo World — local validation

Validated October 16, 2026 against the final local implementation. These are new executions for this implementation, not copied preparation-phase results. No Fuji transactions were submitted.

## Results

| Check | Result |
| --- | --- |
| Backend TypeScript build | Passed |
| Real Noir/Barretenberg + local EVM/Mongo/API suite | 16 passed, 0 failed, 0 skipped; 24.0 seconds |
| Existing application browser journeys inside that suite | Both passed, including admitted/non-admitted ZK evidence |
| Frontend scoring, rulebooks, result evidence and router checks | Passed |
| Frontend TypeScript + production Vite build | Passed; 64 modules, 124.60 kB gzip JavaScript |
| Dedicated Demo World full browser journey | Passed at 1440, 768 and 390 pixels; tablet includes reduced motion |
| Keyless public evidence exporter against the running local deployment | Passed; created a new reconciled manifest without a signer or transaction |
| Design source lint | 0 failures, 0 warnings |
| Real-browser design inspector | 0 failures, 1 restrained-motion warning |
| Git whitespace check | Passed |

Circuit and Solidity compilation also completed during the local Docker build. The integrated suite uses actual generated Noir proofs and the linked Solidity verifier, not a proof stub. It includes all 27 approved scenario scoring claims and six main rights. The persistent demonstration has four additional proofs and two rights in an isolated guard registry.

## Commands executed

From the repository root:

```sh
npm test
npm run build:web
git diff --check
```

From `backend`:

```sh
npm run build
FAIRPASS_BROWSER_TEST=1 FAIRPASS_ZK_BROWSER_TEST=1 node --import tsx --test test/*.test.ts
node --import tsx scripts/demo-world-browser.ts
```

The exporter was executed inside the keyless public backend against the real local deployment. It produced `/tmp/demo-export-verified.json` only after receipt, artifact and scenario reconciliation. The public deployment-input file contained only addresses, deployment receipts and guard metadata; no private key was loaded. See EXPERIENCE.md for the portable exporter invocation and required configuration.

## What the tests establish

- Shared nine-student scenario, authenticated dataset input, deterministic outcomes and integer/half-up precision.
- Real proof acceptance; changed private witnesses, public inputs and an incompatible circuit/VK fail.
- Actual deployed code/creation inputs, pinned VK, canonical receipts, events and scenario/result commitments reconcile.
- Altered VK/code/events and unavailable RPCs fail closed. A revoked dataset changes the world to historical/stale evidence.
- Public projections exclude passwords, signing keys, tokens, salts, Merkle witnesses and private proof inputs. Fictional scores are deliberately shown only as part of this approved public scenario.
- Public replay has no signer; HTTP mutations return 403. The real GET-only experiment checks do not change signer nonces.
- Browser visitors complete all five chapters, inspect a real receipt, reveal six actual assignments, open Narin/Dao/Pim, retain student selection on reload and restart only their local progression.
- Editing the changed-score input works. All three real checks reject the supported invalid operation. Refreshing to unavailable evidence clears the earlier experiment result and disables checks.
- No student session is created, no API mutation request is sent, no browser runtime error occurs and no horizontal overflow appears in captured views. Chain block height is unchanged across the full public browser journey.

The final live HTTP check returned `state: verified`, `mode: local`, 9 students, 3 programs, 27 verified scoring claims, 6 rights and security evidence available. A POST to the public office simulation endpoint returned 403.

## Visual review

The design-taste direction was split-stage (seed 162139455), adapted to the existing FairPass product identity. Actual participant, rulebook, wallet and proof UI replaces the dealt photographic art direction because this brief calls for an interactive application. Existing DM Sans, blue/white/navy, rounded surfaces and student timeline were preserved. Role cards are explicitly required by the brief. No third-party image asset was introduced.

Desktop, tablet and phone captures are in `backend/cache/demo-world-browser/` (ignored generated files). The final Narin mobile capture was visually reviewed: the timeline remains visible, extra program proof cards expand on demand and the next action fits the viewport. The inspector's remaining warning reflects intentionally restrained motion; the experience favors quick actions and reduced-motion support over decorative movement. The React review covered shared fetch coalescing, optional replay session isolation, typed public DTO imports, effect cleanup and accessible native controls.

## Limits of this evidence

This validates a local V2 chain, not Avalanche Fuji. No V2 Fuji deployment, funding, role grants, proofs, issuance or guard transactions were performed. Code/VK and receipt reconciliation are ready for a future genuine Fuji manifest, but acceptance by Fuji has not been demonstrated here.

The score experiment is a genuine local circuit constraint check, not a newly submitted invalid blockchain proof. Eligibility/capacity experiments are historical eth_call executions against a separate real local fixture. They are not mined failed transactions. Historical RPC availability is required.

Allocation remains an authority-run simulation. The circuit does not independently verify the entire matching, cohort completeness, real-world examination truth or student identity. Program associations and eligibility can remain public. Concurrent snapshot requests are coalesced and cached for 15 seconds; no production load benchmark, external presenter security deployment or TLS verification was performed.
