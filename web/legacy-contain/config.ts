import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL) },
});

export const factoryAddress = import.meta.env.VITE_FACTORY_ADDRESS as `0x${string}`;
export const tokenAddress = import.meta.env.VITE_TOKEN_ADDRESS as `0x${string}`;
export const drainerAddress = import.meta.env.VITE_DRAINER_ADDRESS as `0x${string}`;
export const BUDGET = 20_000_000n; // 20 demo USDC at 6 decimals
