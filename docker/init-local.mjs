import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPublicClient, http } from 'viem';
const run = promisify(execFile);
if (process.env.FAIRPASS_LOCAL !== 'true' || process.env.CHAIN_ID !== '31337') throw new Error('Local init only');
const client = createPublicClient({ transport: http(process.env.RPC_URL) });
if (await client.getChainId() !== 31337) throw new Error('Refusing local keys on a non-local chain');
const file = '/app/deployments/local.json';
if (fs.existsSync(file)) {
  const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (previous.chainId === 31337 && await client.getCode({ address: previous.contractAddress })) {
    console.log('Reusing local deployment', previous.contractAddress);
    process.exit(0);
  }
}
const deployed = await run(process.execPath, ['dist/scripts/deploy.js'], { env: process.env });
process.stdout.write(deployed.stdout);
const match = deployed.stdout.match(/Set CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40}) and DEPLOYMENT_BLOCK=(\d+)/);
if (!match) throw new Error('Deployment did not return an address/block');
const [, contractAddress, deploymentBlock] = match;
const env = { ...process.env, CONTRACT_ADDRESS: contractAddress, DEPLOYMENT_BLOCK: deploymentBlock };
const bootstrapped = await run(process.execPath, ['dist/scripts/bootstrap.js'], { env });
process.stdout.write(bootstrapped.stdout);
const manifest = { chainId: 31337, contractAddress, deploymentBlock, database: `fairpass_local_${randomBytes(8).toString('hex')}` };
fs.writeFileSync(`${file}.tmp`, JSON.stringify(manifest, null, 2));
fs.renameSync(`${file}.tmp`, file);
console.log('Local initialization complete. Database:', manifest.database);
