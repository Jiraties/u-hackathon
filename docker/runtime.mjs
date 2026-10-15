import fs from 'node:fs';
import { mnemonicToAccount } from 'viem/accounts';
import { toHex } from 'viem';

if (process.env.FAIRPASS_EXPECT_CHAIN_ID && process.env.CHAIN_ID !== process.env.FAIRPASS_EXPECT_CHAIN_ID) {
  throw new Error('Configured chain does not match this deployment mode');
}

// Loaded before the server or CLI module. Local-only keys never come from .env.
if (process.env.FAIRPASS_LOCAL === 'true') {
  if (process.env.CHAIN_ID !== '31337') throw new Error('Local signing keys require CHAIN_ID=31337');
  const mnemonic = 'test test test test test test test test test test test junk';
  for (const [name, addressIndex] of [['ADMIN_PRIVATE_KEY', 0], ['AUTHORITY_PRIVATE_KEY', 1], ['ISSUER_PRIVATE_KEY', 2]]) {
    process.env[name] = toHex(mnemonicToAccount(mnemonic, { addressIndex }).getHdKey().privateKey);
  }
  process.env.ADMIN_ADDRESS = '';
  if (process.env.FAIRPASS_LOAD_DEPLOYMENT === 'true') {
    const manifest = JSON.parse(fs.readFileSync('/app/deployments/local.json', 'utf8'));
    if (manifest.chainId !== 31337) throw new Error('Invalid local deployment manifest');
    process.env.CONTRACT_ADDRESS = manifest.contractAddress;
    process.env.DEPLOYMENT_BLOCK = manifest.deploymentBlock;
    // New local EVM instance gets its own private dataset.
    process.env.MONGODB_DATABASE = manifest.database;
  }
}
