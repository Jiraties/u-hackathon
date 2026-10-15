import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
const source = fs.readFileSync('contracts/FairPassRegistry.sol', 'utf8');
const input = {
  language: 'Solidity', sources: { 'FairPassRegistry.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } }
};
const importedSources: Record<string, { content: string }> = {};
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: (name: string) => {
  const file = path.resolve('node_modules', name);
  if (!fs.existsSync(file)) return { error: `Missing ${name}` };
  const content = fs.readFileSync(file, 'utf8'); importedSources[name] = { content };
  return { contents: content };
} }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some((e: {severity: string}) => e.severity === 'error')) process.exit(1);
const contract = output.contracts['FairPassRegistry.sol'].FairPassRegistry;
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/FairPassRegistry.json', JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2));
fs.writeFileSync('artifacts/standard-input.json', JSON.stringify({ ...input, sources: { ...input.sources, ...importedSources } }, null, 2));
console.log(`Compiled Solidity ${solc.version()}, Shanghai EVM; deployed size ${contract.evm.deployedBytecode.object.length / 2} bytes`);
