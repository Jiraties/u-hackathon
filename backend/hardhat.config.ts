import { defineConfig } from 'hardhat/config';
// solc-js compiles via scripts/compile.ts; Hardhat supplies only the local EVM.
export default defineConfig({ solidity: '0.8.28', networks: {
  node: { type: 'edr-simulated', chainType: 'l1', throwOnTransactionFailures: false }
} });
