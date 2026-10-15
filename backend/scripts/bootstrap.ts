import 'dotenv/config';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const chainId = Number(process.env.CHAIN_ID), rpc = process.env.RPC_URL;
if (!rpc || ![31337, 43113, 43114].includes(chainId)) throw new Error('Set RPC_URL and CHAIN_ID');
const account = privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY as Hex);
const issuer = privateKeyToAccount(process.env.ISSUER_PRIVATE_KEY as Hex);
const chain = defineChain({ id: chainId, name: 'FairPass', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc) });
if (await client.getChainId() !== chainId) throw new Error('Wrong RPC chain');
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const { abi } = JSON.parse(fs.readFileSync('artifacts/FairPassRegistry.json', 'utf8'));
const address = process.env.CONTRACT_ADDRESS as Address;
if (!await client.readContract({ address, abi, functionName: 'institutions', args: [issuer.address] })) {
  const { request } = await client.simulateContract({ address, abi, functionName: 'authorizeInstitution', args: [issuer.address, true], account });
  const hash = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Bootstrap reverted');
  console.log('Institution authorization:', hash);
}
console.log('Authorized issuer:', issuer.address);
