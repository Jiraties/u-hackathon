import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
const names = ['FairPassRegistry.sol', 'FairPassRegistryV2.sol', 'ScoringVerifier.sol'];
const input = {
  language: 'Solidity', sources: Object.fromEntries(names.filter(name=>fs.existsSync(`contracts/${name}`)).map(name=>[name,{content:fs.readFileSync(`contracts/${name}`,'utf8')}])),
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object'] } } }
};
const importedSources: Record<string, { content: string }> = {};
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: (name: string) => {
  const file = fs.existsSync(path.resolve('contracts', name)) ? path.resolve('contracts', name) : path.resolve('node_modules', name);
  if (!fs.existsSync(file)) return { error: `Missing ${name}` };
  const content = fs.readFileSync(file, 'utf8'); importedSources[name] = { content };
  return { contents: content };
} }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some((e: {severity: string}) => e.severity === 'error')) process.exit(1);
fs.mkdirSync('artifacts', { recursive: true });
for (const [file, name] of [['FairPassRegistry.sol','FairPassRegistry'],['FairPassRegistryV2.sol','FairPassRegistryV2'],['ScoringVerifier.sol','RelationsLib'],['ScoringVerifier.sol','ZKTranscriptLib'],['ScoringVerifier.sol','HonkVerifier']]) {
  const contract = output.contracts[file]?.[name]; if (!contract) continue;
  const size = contract.evm.deployedBytecode.object.length / 2;
  if (size > 24576) throw new Error(`${name} exceeds the EVM deployment size limit: ${size}`);
  fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, linkReferences: contract.evm.bytecode.linkReferences }, null, 2));
  console.log(`Compiled ${name}, Solidity ${solc.version()}, Shanghai EVM; deployed size ${size} bytes`);
}
fs.writeFileSync('artifacts/standard-input.json', JSON.stringify({ ...input, sources: { ...input.sources, ...importedSources } }, null, 2));
