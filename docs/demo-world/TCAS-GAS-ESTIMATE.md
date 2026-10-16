# Hypothetical TCAS Round 3 generation gas — October 16, 2026

The current one-proof-per-student-per-program design is expensive at a full TCAS generation's scale. This is an extrapolation of measured operations, not a claim that the present circuit can process the full generation unchanged.

## Official applicant volume

TCAS69 Round 3 had **125,455 applicants**. The official preference-count distribution implies **977,321 student-program choices**, averaging **7.79 choices per applicant**. Counting only one proof per student would understate a verify-every-ranked-choice model by that factor. The final outcome chart records **82,921 confirmed applicants**.

Sources: [official applicant and choice statistics, May 18, 2026](https://assets.mytcas.com/69/T69-R3.jpg), [official final outcomes, May 29, 2026](https://assets.mytcas.com/69/T69-R3-ds-sorting-close-graph.jpg), linked from [myTCAS statistics](https://www.mytcas.com/stat/).

| Number of choices | Applicants |
| --- | ---: |
| 1 | 2,891 |
| 2 | 2,709 |
| 3 | 3,656 |
| 4 | 4,213 |
| 5 | 5,351 |
| 6 | 5,938 |
| 7 | 36,714 |
| 8 | 6,228 |
| 9 | 5,563 |
| 10 | 52,192 |

## Measured gas model

The actual 60 Fuji deployment and main-scenario receipts are preserved in [fuji-gas.json](fuji-gas.json). Median charged gas per operation was:

| Operation | Gas |
| --- | ---: |
| Verify one scoring proof | 2,713,838 |
| Record one result | 127,250 |
| Record confirmation | 33,183 |
| Issue one admission right | 189,624 |

Using one scoring proof for every ranked choice, one final result per applicant and confirmation/issuance only for the 82,921 final confirmed applicants gives approximately **2,686,730,395,995 gas**. This excludes per-program rule publication, dataset-root publication, deployment, second-pass/replacement proofs, later withdrawals/revocations and retries.

Several free-RPC gas estimates in the actual replay were inflated to 25,199,580 gas. On Helicon, the charged floor is half the transaction gas limit, so those calls paid for 12,599,790 gas even when the normal operation needed much less. Extrapolating the observed average billing pattern instead of the median gives **5,881,032,550,432 gas**. Bound and validate transaction gas limits before a mainnet rollout; do not rely on this free RPC's estimates for budgeting.

## Fee sensitivity

These are constant gas-price scenarios, not live quotes or guaranteed total costs:

| Effective gas price | Median-operation model | Observed RPC billing pattern |
| --- | ---: | ---: |
| 1 gwei | 2,686.73 AVAX | 5,881.03 AVAX |
| 5 gwei | 13,433.65 AVAX | 29,405.16 AVAX |
| 25 gwei | 67,168.26 AVAX | 147,025.81 AVAX |

Formula: `AVAX = gas × gas price in gwei / 1,000,000,000`. Fiat cost is that AVAX amount multiplied by the exchange rate at purchase. No fiat exchange rate is assumed here.

Avalanche's official documentation reports a validator-voted mainnet minimum near 5 nAVAX/gwei after September 2026, subject to change. Congestion and validator preferences can increase the effective price; a generation-scale workload itself can affect it. Fuji's tiny observed fees are not a mainnet price proxy. See [Avalanche transaction fees](https://academy.avax.network/docs/rpcs/other/guides/txn-fees).

## What must change before scaling

The current authenticated exam tree has depth 8 and supports at most 256 records; the workflow API limits one submitted cohort to 100 applicants. Publishing replacement roots in the same year/round context invalidates the old root's current eligibility, so repeatedly publishing batches is not a valid scaling shortcut. Full TCAS size requires a larger authenticated input scheme/circuit and corresponding verifier validation. That can change per-proof gas, so the table is a planning estimate.

The supported circuit covers three exam subjects and the implemented weighted-score/minimum policy. It does not cover every real TCAS policy. Allocation is still authority-run; these gas amounts do not buy a proof of complete allocation fairness. CPU/prover infrastructure, databases and hosting are separate costs.

For materially cheaper deployment, investigate batched or recursive proof verification and compact batch result commitments. Those are future architecture changes, not capabilities implemented by this release.
