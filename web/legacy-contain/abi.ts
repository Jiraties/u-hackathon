import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "function createSandbox(address token, uint256 amount) returns (address)",
  "event SandboxCreated(address indexed owner,address indexed sandbox,address indexed token,uint256 amount)",
]);
export const sandboxAbi = parseAbi([
  "function owner() view returns (address)",
  "function funded() view returns (bool)",
  "function fund()",
  "function execute(address target,bytes callData) returns (bytes)",
  "function withdrawToken(address token)",
]);
export const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function faucet()",
]);
export const drainerAbi = parseAbi([
  "function drain(address token,address victim,uint256 amount)",
]);
