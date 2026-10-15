import 'dotenv/config';
import fs from 'node:fs';
import { createPublicClient, defineChain, http, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { commitment } from '../src/crypto.js';
const id = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(process.argv[2]) as Hex;
const rpc = z.url().parse(process.env.RPC_URL);
const chainId = z.coerce.number().refine(n => [31337, 43113, 43114].includes(n)).parse(process.env.CHAIN_ID);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(process.env.CONTRACT_ADDRESS) as Address;
const chain = defineChain({ id: chainId, name: 'FairPass', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc) });
if (await client.getChainId() !== chainId) throw new Error('Wrong RPC chain');
const { abi } = JSON.parse(fs.readFileSync('artifacts/FairPassRegistry.json', 'utf8'));
if (process.argv[3]) {
  // Private proof must be supplied voluntarily by the student. Never upload it to a public explorer.
  const proof = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const salt = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(proof.salt) as Hex;
  const [value, recordedAt] = await client.readContract({ address, abi, functionName: 'resultCommitment', args: [id] }) as [Hex, bigint];
  console.log({ resultIntegrity: recordedAt !== 0n && commitment(proof.report, salt) === value ? 'verified' : 'not_verified',
    scoreAuthenticity: 'not_verified', allocationCorrectness: 'not_verified', chainId, contractAddress: address });
} else {
  const [program, status, issuer, year] = await client.readContract({ address, abi, functionName: 'credential', args: [id] }) as [Hex, number, Address, number];
  console.log({ credentialId: id, status: ['not_found', 'valid', 'enrolled', 'withdrawn', 'revoked'][status], program, issuer, year, holderIdentityVerified: false, chainId, contractAddress: address });
}
