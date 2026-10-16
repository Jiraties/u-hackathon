import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
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

}

if (process.env.FAIRPASS_LOAD_DEPLOYMENT === 'true') {
    const manifest = JSON.parse(fs.readFileSync('/app/deployments/local.json', 'utf8'));
    if (manifest.chainId !== 31337) throw new Error('Invalid local deployment manifest');
    process.env.CONTRACT_ADDRESS = manifest.contractAddress;
    process.env.DEPLOYMENT_BLOCK = manifest.deploymentBlock;
    // New local EVM instance gets its own private dataset.
    process.env.MONGODB_DATABASE = manifest.database;
  }

// Only the public receipt manifest travels through this variable. Private records stay in MongoDB.
if (process.env.FAIRPASS_REPLAY_MANIFEST_GZIP_BASE64) {
  const contents = gunzipSync(Buffer.from(process.env.FAIRPASS_REPLAY_MANIFEST_GZIP_BASE64, 'base64'), {maxOutputLength: 2 * 1024 * 1024}).toString('utf8');
  JSON.parse(contents); // Full strict schema and chain reconciliation run in the API.
  const file = '/app/deployments/demo-world-fuji.json';
  fs.mkdirSync('/app/deployments', {recursive:true});
  if (fs.existsSync(file) && fs.readFileSync(file,'utf8') !== contents) throw new Error('Preserve the existing replay manifest; use a fresh deployment');
  if (!fs.existsSync(file)) fs.writeFileSync(file, contents, {flag:'wx'});
  process.env.DEMO_REPLAY_MANIFEST = file;
}
