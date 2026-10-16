# Private scoring: assessment and implementation plan

## Existing trust boundaries

- FairPassRegistry v1 is non-upgradeable. It authenticates issuer/result-authority transactions, locks a SHA-256 rulebook reference, requires confirmation, prevents duplicate rights and enforces seats. It does not prove scores, provenance, eligibility or allocation arithmetic. Solidity private storage is still observable.
- Express accepts institution-entered fictional scores. Shared evaluateRulebook and allocatePreview calculate and match them off-chain. A result is a salted Keccak commitment to a private JSON report. Matching that commitment proves integrity only.
- Mongo holds identities, passwords, private reports, salts and yearly opaque subject mappings. Server signers currently supply the result and institutional transaction authority. A compromised server can fabricate a reported score.
- The browser uses authenticated private endpoints and separate public program/credential views. Preview mode is entirely synthetic. No existing ZK badge is authoritative.
- Docker defaults to local chain 31337; Fuji uses a non-upgradeable v1 deployment. Existing keys, addresses, databases and deployments will not be silently replaced.

## Narrow implementation

1. Pin Noir compiler/executor and Barretenberg. Compile a circuit and generate its real EVM zero-knowledge verifier before expanding integration.
2. Add a v2 registry alongside v1. An immutable verifier checks public inputs constructed from the registry's own locked policy and authorized exam roots. All v2 rights require verified, eligible scoring plus the existing authority allocation, confirmation and seat gates; no legacy issue bypass.
3. Support exactly three distinct exam subjects, 100-point sources, hundredth-point scores, basis-point weights totaling 10000, hundredth-point minimums and half-up rounded totals. Reject curriculum/GPAX/custom/unsupported policies explicitly. Public policy fields are authoritative and have a deterministic ABI-encoded SHA-256 commitment; the existing descriptive JSON hash is retained separately.
4. A separate examination-authority role authenticates randomized, domain-separated Merkle leaves. Private scores and witnesses stay in Mongo/prover memory. Contract verification binds registry, chain, dataset, program, year, round, rule version, result and subject. Publish a blinded total commitment instead of the total.
5. Expose private verification and evidence in the existing console/wallet. Allocation stays an authenticated simulator decision, not a ZK fairness claim.
6. Test real proofs on the local EVM, negative witnesses/public inputs, lifecycle gates, public-data privacy and reproducible gas/prover metrics. Prepare a guarded Fuji deployment command and migration manifest. External deployment and grants require the user's approval of the concrete plan.

## Toolchain decision

No nargo, bb or Rust toolchain is installed. Investigate the official JavaScript toolchain first: @noir-lang/noir_wasm and noir_js 1.0.0-rc.5, @aztec/bb.js 5.2.1. Use verifierTarget=evm, which enables zero knowledge; evm-no-zk is forbidden. Compatibility is established by generating and verifying a real proof on the EVM, not inferred from package versions. Generated verifier/VK are circuit-specific and immutable.
