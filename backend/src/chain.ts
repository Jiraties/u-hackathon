import fs from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Config } from './config.js';
export type ChainReference = { chainId: number; contractAddress: Address; transactionHash: Hex; blockNumber: string };
export interface ChainGateway {
  info: { chainId: number; contractAddress: Address; deploymentBlock: string; protocolVersion?: number };
  issuer: Address;
  read(name: string, args?: readonly unknown[]): Promise<any>;
  write(role: 'issuer' | 'authority', name: string, args: readonly unknown[]): Promise<ChainReference>;
  events(program: Hex, from?: bigint, to?: bigint): Promise<unknown>;
  ready(): Promise<void>;
}
export function createChain(config: Config): ChainGateway {
  const artifact = JSON.parse(fs.readFileSync(config.REGISTRY_VERSION === 2 ? 'artifacts/FairPassRegistryV2.json' : 'artifacts/FairPassRegistry.json', 'utf8')) as { abi: Abi };
  const chain = defineChain({ id: config.CHAIN_ID, name: 'FairPass EVM', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: { default: { http: [config.RPC_URL] } } });
  const address = config.CONTRACT_ADDRESS as Address;
  const publicClient = createPublicClient({ chain, transport: http(config.RPC_URL, { timeout: 15000 }) });
  const issuer = config.DEMO_READ_ONLY ? null : privateKeyToAccount(config.ISSUER_PRIVATE_KEY as Hex);
  const authority = config.DEMO_READ_ONLY ? null : privateKeyToAccount(config.AUTHORITY_PRIVATE_KEY as Hex);
  const wallets = issuer && authority ? {
    issuer: createWalletClient({ account: issuer, chain, transport: http(config.RPC_URL) }),
    authority: createWalletClient({ account: authority, chain, transport: http(config.RPC_URL) }),
  } : null;
  // One signer queue per process. Run a single write replica per signing wallet.
  let tail: Promise<unknown> = Promise.resolve();
  return {
    info: { chainId: chain.id, contractAddress: address, deploymentBlock: String(config.DEPLOYMENT_BLOCK), protocolVersion: config.REGISTRY_VERSION ?? 1 }, issuer: issuer?.address ?? config.ISSUER_ADDRESS as Address,
    async ready() {
      if (await publicClient.getChainId() !== chain.id) throw new Error('RPC chain ID mismatch');
      if (!await publicClient.getCode({ address })) throw new Error('No contract at configured address');
      if(config.REGISTRY_VERSION === 2 && await publicClient.readContract({address,abi:artifact.abi,functionName:'protocolVersion'}) !== 2n) throw new Error('Configured registry does not support ZK scoring');
      if(config.DEMO_READ_ONLY)return;
      if(config.REGISTRY_VERSION === 2) {
        const examRole=await publicClient.readContract({address,abi:artifact.abi,functionName:'EXAM_AUTHORITY'});
        for(const account of [authority!.address,issuer!.address]) if(await publicClient.readContract({address,abi:artifact.abi,functionName:'hasRole',args:[examRole,account]})) throw new Error('API signers must not control examination dataset authentication');
      }
      const role = await publicClient.readContract({ address, abi: artifact.abi, functionName: 'RESULT_AUTHORITY' });
      if (!await publicClient.readContract({ address, abi: artifact.abi, functionName: 'hasRole', args: [role, authority!.address] })) throw new Error('Authority signer lacks RESULT_AUTHORITY');
      if (!await publicClient.readContract({ address, abi: artifact.abi, functionName: 'institutions', args: [issuer!.address] })) throw new Error('Issuer is not authorized; run bootstrap');
    },
    async read(functionName, args = []) {
      return publicClient.readContract({ address, abi: artifact.abi, functionName, args });
    },
    write(role, functionName, args) {
      if(!wallets)return Promise.reject(new Error('read_only_replay'));
      const run = tail.then(async () => {
        const wallet = wallets[role];
        const { request } = await publicClient.simulateContract({ address, abi: artifact.abi, functionName, args, account: wallet.account });
        const transactionHash = await wallet.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 120000 });
        if (receipt.status !== 'success') throw new Error('Transaction reverted');
        return { chainId: chain.id, contractAddress: address, transactionHash, blockNumber: String(receipt.blockNumber) };
      });
      tail = run.catch(() => undefined);
      return run;
    },
    async events(program, from = config.DEPLOYMENT_BLOCK, to) {
      const latest = await publicClient.getBlockNumber();
      const end = to ?? (from + 1999n < latest ? from + 1999n : latest);
      if (from < config.DEPLOYMENT_BLOCK || end < from || end > latest || end - from > 1999n) throw new Error('Invalid event range (maximum 2000 blocks)');
      const logs = await publicClient.getContractEvents({ address, abi: artifact.abi, fromBlock: from, toBlock: end });
      return { fromBlock: String(from), toBlock: String(end), nextBlock: end < latest ? String(end + 1n) : null,
        events: logs.filter(log => (log.args as Record<string, unknown>).program === program).map(log => ({ event: log.eventName, args: log.args, transactionHash: log.transactionHash, blockNumber: String(log.blockNumber), logIndex: log.logIndex })) };
    },
  };
}
