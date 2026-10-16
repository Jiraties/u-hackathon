# Trust boundaries and implementation limits

## On-chain

- `AccessControlDefaultAdminRules`: admin transfer delay 2 days; role changes/institution allowlist remain admin powers.
- Separate result authority role and university address authorization. Issuer cannot publish/confirm results unless separately granted authority.
- Programs have fixed issuer/year; rules and capacity can be revised with `reviseProgram(id, capacity, newRulesHash, reason)` **only before lock**, producing capacity/rules audit events. After lock create a new cycle/program instead. API registration auto-locks and does not expose revisions.
- Immutable result commitment and single-use result → right binding. Only confirmed admitted results can issue rights.
- `active <= capacity`, enrolled counts active; withdrawal/revocation preserve history and do not replenish issuance allowance. Reallocation is an explicit authorized transaction.
- One active right per opaque subject/year. Subject consistency depends on trusted authority and private backend mappings, not a civil-identity oracle.
- Guardian pause stops mutations, permits reads. Admin unpauses. Contract takes no user funds and performs no external calls or transfers.
- Non-upgradeable registry; no NFT/transfer semantics or diploma implementation.

## Off-chain

- Mongo stores names, scrypt password hashes, hashed session tokens, scores, preferences, salts and student↔opaque subject/result mappings. Session expiry is checked during reads and a TTL index cleans old records.
- Student routes scope lookups to authenticated session identity. No public registration or unauthenticated student-result lookup.
- Integration/admin/issuer API bearer tokens are separate machine credentials. CORS is not authentication. Rate limits are process-local and login rate limits are IP-wide. There is no MFA, external identity provider, password recovery or full university RBAC UI in this MVP.
- Durable intent is saved **before** blockchain publication. Random IDs/salt persist across retries; existing commitments/credentials are read before reissuing. A DB failure after mining may leave the transaction reference missing in Mongo, but chain state still establishes existence. Events can recover the transaction reference.
- Receipt success is checked before recording completion. RPC timeouts yield 503 and caller must retry the same logical operation. There is no autonomous pending-operation worker; replay the original integration event or issue operation to reconcile.
- Workflow/signer queues are per process. Run **one write replica per signing wallet**. Multi-process scaling needs a distributed nonce manager and workflow lock; it is not implemented.
- Back up Mongo and restrict access. Loss of salts/private mappings destroys the ability to prove/disclose private results even though public chain records remain. Mongo compose is local development infrastructure; configure authenticated encrypted Mongo for hosted use.

## Privacy

Only random IDs/subject commitments, program/year, capacity, salted report commitment and statuses enter chain transactions. No names, national IDs, scores or preference lists are sent on-chain. Subject is random per student/year, not a low-entropy hash of an ID. Reused across that year's results to enforce one active right.

**Solidity `private` does not encrypt storage.** Result admission flag, program, subject, confirmations and result↔right bindings are observable in transaction calldata/storage by chain analysts even though the public API projects fewer fields. Program/timing/subject correlation remains possible. This is pseudonymity, not strong anonymity or zero-knowledge privacy. The public credential endpoint exposes program/year intentionally; sharing its code authorizes no access to private identity or scores.

Private proof contains report and salt. The student may disclose it voluntarily; bearer code/QR alone proves no holder identity. There is no identity-bound presentation protocol or ZK allocation proof in this MVP.

## Meaning of proof

- Result integrity: recompute `keccak256(UTF8(canonical({ scheme: "fairpass-result-v1", salt, record })))`, compare with live on-chain commitment and require a nonzero recording timestamp. `record` includes backend-captured rule hashes.
- Score authenticity: **not independently verified**. Integration token authenticates the sender to this server, not an examination authority signature. Demo scores remain fictional.
- Allocation correctness: **not independently verified**. Simulator tests demonstrate this particular deterministic algorithm on supplied fictional inputs, not a complete authenticated national dataset, official TCAS tie handling or a cryptographic fairness proof.
- Capacity enforcement covers this contract only. Institutions can act outside the protocol. Authorized roles can publish incorrect data; commitment makes changes detectable, not original errors impossible.

Before handling real admissions data, add the official integration/authentication model, institutional key custody, independent contract/security review, identity verification and an agreed data protection/retention policy. Fuji deployment itself is functional without claiming those integrations exist.

## Integrated browser boundaries

Institutional sessions are distinct from student sessions and scoped to the configured institution/programs before server signing. A single configured institution maps to one issuer signer. Student sessions cannot call office/issuer operations, and institution sessions cannot read student wallet/proof APIs.

Browser bearer sessions use sessionStorage with eight-hour server-enforced expiry and logout invalidation. They remain exposed to same-origin JavaScript/XSS; this is not an HttpOnly session or MFA implementation. Machine credentials and signing keys remain server-only.

Full shared rulebooks use SHA-256 over canonical fairpass-rulebook-v1 fields. The intake key excludes version; changed publication cannot create another quota for the same institution/program/year/round. A durable simulation run claims each program intake before broadcasting result attestations. Run one writer replica per signer. Legacy integration/CLI protocols remain operational compatibility paths and are not the full-rulebook browser workflow.

prepare-private-fuji.ts is an opt-in Fuji-only migration tool. It creates server-side key material (mode 600), funds new wallets with test AVAX, deploys a new registry and preserves the prior .env before activation. It must not be run without authorization for these side effects. Deployment/key generation is not a substitute for a professional audit or production key custody.
