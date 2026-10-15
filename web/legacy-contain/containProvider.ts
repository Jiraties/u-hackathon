import { encodeFunctionData, type Address, type Hex } from "viem";
import { sandboxAbi } from "./abi";

/** Limited EIP-1193-like demo adapter for our IN-PAGE demo only.
 * Not an injected wallet or a supported integration with external dApps.
 * Never blindly forward wallet signing methods to the owner wallet.
 */
export type DemoTransaction = {
  from?: Address;
  to?: Address;
  data?: Hex;
  value?: Hex;
};

export type ProviderOptions = {
  owner: Address;
  sandbox: Address;
  chainId: number;
  submitByOwner: (sandboxExecutionData: Hex) => Promise<Hex>;
  readRpc: (method: string, params?: unknown[]) => Promise<unknown>;
  confirm: (tx: DemoTransaction) => Promise<boolean>;
};

const READ_METHODS = new Set([
  "eth_call", "eth_getBalance", "eth_getCode", "eth_getBlockByNumber",
  "eth_getTransactionReceipt", "eth_blockNumber", "eth_getLogs",
  "eth_getTransactionByHash", "eth_estimateGas", "eth_gasPrice",
]);

export function makeContainDemoProvider(options: ProviderOptions) {
  const subscribers = new Map<string, Set<(...args: unknown[]) => void>>();
  const provider = {
    async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [options.sandbox];
      }
      if (method === "eth_chainId") return `0x${options.chainId.toString(16)}`;
      if (method === "net_version") return String(options.chainId);
      if (method === "eth_sendTransaction") {
        const tx = params[0] as DemoTransaction | undefined;
        if (!tx?.to) throw new Error("Contract creation is unsupported in protected mode");
        if (tx.from && tx.from.toLowerCase() !== options.sandbox.toLowerCase()) {
          throw new Error("From address must match the Contain sandbox");
        }
        if (tx.value && BigInt(tx.value) !== 0n) {
          throw new Error("This MVP only supports token calls, not native ETH transfers");
        }
        if (!(await options.confirm(tx))) throw new Error("User rejected protected transaction");
        const data = encodeFunctionData({
          abi: sandboxAbi,
          functionName: "execute",
          args: [tx.to, tx.data ?? "0x"],
        });
        return await options.submitByOwner(data);
      }
      if (READ_METHODS.has(method)) return options.readRpc(method, params);
      if (method.startsWith("eth_sign") || method.startsWith("personal_sign") ||
          method.startsWith("wallet_") || method.startsWith("eth_send")) {
        throw new Error(`${method} blocked: unsupported signing or wallet method`);
      }
      throw new Error(`Unsupported RPC method: ${method}`);
    },
    on(eventName: string, listener: (...args: unknown[]) => void) {
      const bucket = subscribers.get(eventName) ?? new Set();
      bucket.add(listener);
      subscribers.set(eventName, bucket);
      return provider;
    },
    removeListener(eventName: string, listener: (...args: unknown[]) => void) {
      subscribers.get(eventName)?.delete(listener);
      return provider;
    },
  };
  return provider;
}

/** EIP-6963 announcement works within the current tab only.
 * For use on other sites, you MUST build an audited browser extension with
 * content-script isolation, strict RPC bridge validation and per-origin consent.
 */
export function announceDemoProvider(provider: ReturnType<typeof makeContainDemoProvider>) {
  const info = Object.freeze({
    uuid: crypto.randomUUID(),
    name: "Contain Sandbox (Demo)",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%2313263f'/%3E%3Cpath d='M32 9 51 17v14c0 13-8 21-19 25C21 52 13 44 13 31V17z' fill='%2341e1ad'/%3E%3C/svg%3E",
    rdns: "dev.contain.demo", // illustration only; not a registered, verified wallet identity
  });
  const detail = Object.freeze({ info, provider });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  return () => window.removeEventListener("eip6963:requestProvider", announce);
}
