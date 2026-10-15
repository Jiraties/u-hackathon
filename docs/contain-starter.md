# Contain — $20 Web3 security sandbox (hackathon starter)

> **Not audited. Sepolia testnet and demo assets ONLY.**

Contains:

- `chain/contracts/ContainSandbox.sol` — isolated contract account, owner-only transaction execution, one-time 20 dUSDC funding, recovery of remaining tokens.
- `chain/contracts/SandboxFactory.sol` — creates a separate sandbox per session.
- `chain/contracts/MockUSDC.sol` — **fake** 6-decimal test token, 1,000-token faucet, no monetary value.
- `chain/contracts/DemoDrainer.sol` — intentionally malicious allowance-draining contract for controlled testnet demonstrations.
- `chain/test/Contain.ts` — isolation attack scenario with a second attacker account.
- `web/` — React + TS + Wagmi + Viem management UI and an in-page demo of an EIP-1193-style provider.

## Security model

Suppose the owner has 1,000 demo USDC. They deploy a new sandbox with `initialBudget = 20_000_000` (6 decimals), approve **exactly** that amount from their main wallet to the sandbox, and call `fund()` once.

The resulting state:

- Main wallet: 980 dUSDC.
- Sandbox: 20 dUSDC.
- Remaining allowance owner -> sandbox: **zero**.
- Malicious dApp never gets permission over the main wallet, only token approval from the sandbox.

A malicious dApp can drain all 20 dUSDC from the sandbox. It cannot drain the owner's 980 dUSDC merely by knowing the owner's address. But this is **not a universal or perpetual $20 cap**: the sandbox can receive additional tokens by direct transfers, approvals can persist, tokens may be swapped, and unexpected assets may create additional risk. Create new sandboxes rather than refilling a compromised one.

This does **not** stop a compromised owner's private key, deposits into exploitable external protocols, social engineering that convinces an owner to sign transactions outside Contain, or crypto price volatility. It also does **not** provide anonymity or unlinkability: factory deployment and token funding reveal relationships on-chain.

## Quick start

### 1. Install

Use Node 22.13+ and npm:

```bash
npm install
npm run build:contracts
npm run test:contracts
```

### 2. Deploy demonstration contracts to Sepolia

Get some **Sepolia test ETH**, and a separate throwaway deployer key. From `chain/`:

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/ContainDemo.ts --network sepolia
```

The deployer key is ONLY for the three fixed demo contracts. The Contain frontend uses MetaMask to deploy individual owner-controlled sandboxes; the backend never receives the user's key.

The deployment output will include addresses for:

```text
ContainDemo#MockUSDC
ContainDemo#SandboxFactory
ContainDemo#DemoDrainer
```

### 3. Configure web

Copy `web/.env.example` to `web/.env` and paste each address into the corresponding variable. Set your public Sepolia RPC URL.

```bash
npm run dev
```

Open the displayed Vite development URL with MetaMask installed, connected to **Sepolia**. **Only use a throwaway test wallet.**

### 4. Demonstrate the attack

1. Connect MetaMask.
2. Claim 1,000 dUSDC via the public mock faucet.
3. Create a new $20 sandbox (smart contract address).
4. Approve the sandbox for exactly 20 dUSDC and fund it. Confirm the main wallet holds 980 and sandbox holds 20.
5. Click **Connect with Contain** (in-page dApp simulator) — dApp receives sandbox address, not the main address.
6. Click **Simulate malicious approval** — a dangerous unlimited allowance is written **by sandbox.execute()**, not main wallet approve().
7. Click **Simulate attacker drain** — a permissionless external drainer moves 20 tokens from sandbox to attacker contract.
8. Verify main wallet still has 980 dUSDC. The contract integration test also executes step 7 from a different account.

## What is and isn't implemented

| Capability | Status |
|---|---|
| Isolated smart-contract account | Implemented |
| Exact one-time initial funding amount | Implemented |
| Owner-only sandbox execution | Implemented |
| Testnet malicious allowance + drain demo | Implemented |
| Protected provider inside the sample React app | Implemented (limited EIP-1193-style adapter) |
| External dApp discovery in Chrome and MetaMask wallet selector | **Not implemented** |
| EIP-6963 wallet event demonstrated within same tab | Included as an example helper |
| ERC-1271 contract signatures / real dApp compatibility | **Not implemented** |
| Unlimited dApp RPC methods or native ETH sends | **Intentionally not implemented** |
| Audit and real asset support | **Not implemented** |

### Next: working on arbitrary supported websites

You need to build an MV3 extension that securely injects the Contain provider on each permitted origin, advertises it via EIP-6963, and routes RPC requests to an extension-controlled approval UI. Use a content-script/background/message bridge with strict origin checks and method allowlists; do **not** let untrusted pages control the MetaMask signer or modify which sandbox contract is being called. Never auto-forward `personal_sign`, EIP-712 typed signatures, or arbitrary `wallet_*` RPC. Implement ERC-1271 for dApps requiring smart-account signatures and transaction receipt simulation appropriate to the target protocols.

The in-page EIP-6963 helper is an illustration only; it does **not** register a wallet on unrelated dApp websites. Claiming arbitrary-dApp protection without an actual extension or wallet implementation would be misleading.

## Future hardening

- Block unbounded token allowances from sandbox or replace with capped approvals; simulate raw calldata before confirmation.
- Explicit trusted token contracts; deny malicious ERC-20 token callbacks and reentrancy patterns.
- Track ERC-20 and NFT permissions and never reuse a sandbox with outstanding permissions.
- Handle token recovery and revoke pending allowances if possible before cleanup.
- Enable native ETH only with an explicit extra budget; native gas is currently paid by the owner wallet.
- Define safety guarantees separately for main token, NFTs, gas, and external collateral positions.
- Audit all access-control, session authorization, and browser-message surfaces.

## Why this design?

The separation is enforced by Ethereum's account model: calls to dApps originate from the Contain contract address. The owner uses MetaMask only to authenticate owner-only execution, and the dApp doesn't get a token allowance over the owner's main address. This showcases **blast-radius reduction**, not perfect scam prevention.
