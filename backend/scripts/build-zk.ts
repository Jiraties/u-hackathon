import fs from 'node:fs';
import path from 'node:path';
import { compile, createFileManager } from '@noir-lang/noir_wasm';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
const root = path.resolve('../zk/scoring');
const { program } = await compile(createFileManager(root));
const api = await Barretenberg.new({ threads: 1 });
try {
  const backend = new UltraHonkBackend(program.bytecode, api);
  const vk = await backend.getVerificationKey({ verifierTarget: 'evm' });
  const source = await backend.getSolidityVerifier(vk, { verifierTarget: 'evm' });
  fs.mkdirSync(path.join(root, 'target'), { recursive: true });
  fs.writeFileSync(path.join(root, 'target/fairpass_scoring.json'), JSON.stringify(program));
  fs.writeFileSync(path.join(root, 'target/vk'), vk);
  fs.writeFileSync('contracts/ScoringVerifier.sol', source);
  console.log('Generated circuit-specific ZK EVM verifier. No witnesses written.');
} finally { await api.destroy(); }
