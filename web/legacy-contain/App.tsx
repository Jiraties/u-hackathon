import { useCallback, useEffect, useMemo, useState } from "react";
import { getPublicClient, getWalletClient } from "@wagmi/core";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  decodeEventLog, encodeFunctionData, formatUnits, maxUint256,
  type Address, type Hex,
} from "viem";
import { BUDGET, config, drainerAddress, factoryAddress, tokenAddress } from "./config";
import { drainerAbi, factoryAbi, sandboxAbi, tokenAbi } from "./abi";
import { announceDemoProvider, makeContainDemoProvider } from "./containProvider";

const USD = (raw: bigint) => formatUnits(raw, 6);
const SHORT = (a: string) => a.slice(0, 7) + "…" + a.slice(-5);

export default function App() {
  const { address: owner, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [sandbox, setSandbox] = useState<Address>();
  const [walletConnectedToDapp, setWalletConnectedToDapp] = useState(false);
  const [approvedBySandbox, setApprovedBySandbox] = useState(false);
  const [fundedOnce, setFundedOnce] = useState(false);
  const [balances, setBalances] = useState({ main: 0n, sandbox: 0n, drainer: 0n });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("Connect your MetaMask wallet on Sepolia to begin.");
  const chainOk = isConnected && chainId === sepolia.id;
  const deployed = Boolean(factoryAddress && tokenAddress && drainerAddress &&
    [factoryAddress, tokenAddress, drainerAddress].every(a => /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/.test(a)));

  const publicClient = getPublicClient(config);
  const refresh = useCallback(async (at?: Address) => {
    if (!publicClient || !owner || !deployed) return;
    const target = at ?? sandbox;
    try {
      const [main, isolated, stolen] = await Promise.all([
        publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [owner] }),
        target ? publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [target] }) : Promise.resolve(0n),
        publicClient.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "balanceOf", args: [drainerAddress] }),
      ]);
      setBalances({ main, sandbox: isolated, drainer: stolen });
    } catch (error) { setNotice(`Balance read failed: ${String(error)}`); }
  }, [publicClient, owner, sandbox, deployed]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setSandbox(undefined); setWalletConnectedToDapp(false); setApprovedBySandbox(false); setFundedOnce(false); }, [owner, chainId]);

  const send = useCallback(async (to: Address, abi: typeof tokenAbi | typeof factoryAbi | typeof sandboxAbi | typeof drainerAbi, functionName: string, args: readonly unknown[] = []) => {
    if (!owner) throw Error("Connect MetaMask first");
    const client = await getWalletClient(config);
    if (!client || !publicClient) throw Error("Wallet and RPC clients unavailable");
    // Dynamic ABI/functionName is confined to this demo's pre-approved contracts and functions.
    // Use a type cast because Wagmi/Viem's ABI generics are intentionally stricter.
    const hash = await client.writeContract({
      address: to, abi, functionName, args, account: owner, chain: sepolia,
    } as Parameters<typeof client.writeContract>[0]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw Error("Transaction reverted");
    return receipt;
  }, [owner, publicClient]);

  const run = async (action: string, fn: () => Promise<void>) => {
    try { setBusy(action); setNotice(`${action}…`); await fn(); setNotice(`${action} complete`); }
    catch (e) { setNotice(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(""); }
  };

  const createSandbox = async () => {
    const receipt = await send(factoryAddress, factoryAbi, "createSandbox", [tokenAddress, BUDGET]);
    const log = receipt.logs.find(l => l.address.toLowerCase() === factoryAddress.toLowerCase());
    if (!log) throw Error("No SandboxCreated log found");
    const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
    if (decoded.eventName !== "SandboxCreated") throw Error("Unexpected factory event");
    const next = decoded.args.sandbox;
    setSandbox(next);
    setWalletConnectedToDapp(false);
    setApprovedBySandbox(false);
    setFundedOnce(false);
    await refresh(next);
  };

  const fundSandbox = async () => {
    if (!sandbox) throw Error("Create sandbox first");
    // Exact approval to sandbox contract; fund() consumes full allowance immediately.
    await send(tokenAddress, tokenAbi, "approve", [sandbox, BUDGET]);
    await send(sandbox, sandboxAbi, "fund");
    setFundedOnce(true);
    await refresh(sandbox);
  };

  const provider = useMemo(() => {
    if (!sandbox || !owner || !chainOk || !publicClient) return null;
    return makeContainDemoProvider({
      owner, sandbox, chainId: sepolia.id,
      confirm: async tx => {
        if (tx.to?.toLowerCase() === tokenAddress.toLowerCase()) {
          return window.confirm("The dApp requests a token operation from the ISOLATED sandbox. This demo intentionally permits a malicious unlimited approval. Continue?");
        }
        return window.confirm(`Execute protected transaction to ${tx.to}?`);
      },
      submitByOwner: async data => {
        const walletClient = await getWalletClient(config);
        if (!walletClient) throw Error("MetaMask unavailable");
        const hash = await walletClient.sendTransaction({ account: owner, chain: sepolia, to: sandbox, data, value: 0n });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw Error("Execution reverted");
        return hash;
      },
      readRpc: async (method, params) => {
        const permitted = ["eth_call", "eth_getBalance", "eth_getCode", "eth_getBlockByNumber", "eth_getTransactionReceipt", "eth_blockNumber", "eth_getLogs", "eth_getTransactionByHash", "eth_estimateGas", "eth_gasPrice"];
        if (!permitted.includes(method)) throw Error("RPC method not allowed");
        // Read-only, validated in the adapter. No signing methods are forwarded.
        return publicClient.request({ method, params } as Parameters<typeof publicClient.request>[0]);
      },
    });
  }, [sandbox, owner, chainOk, publicClient]);

  useEffect(() => {
    if (!provider) return;
    return announceDemoProvider(provider);
  }, [provider]);

  const connectDapp = async () => {
    if (!provider) throw Error("Funded sandbox not available");
    const result = await provider.request({ method: "eth_requestAccounts" }) as Address[];
    if (result[0]?.toLowerCase() !== sandbox?.toLowerCase()) throw Error("Unsafe account returned");
    setWalletConnectedToDapp(true);
  };

  const approveMaliciousDapp = async () => {
    if (!provider || !sandbox) throw Error("Protected connection required");
    const data = encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [drainerAddress, maxUint256] });
    await provider.request({ method: "eth_sendTransaction", params: [{ from: sandbox, to: tokenAddress, data, value: "0x0" }] });
    setApprovedBySandbox(true);
    await refresh(sandbox);
  };

  const drainDemo = async () => {
    if (!sandbox) throw Error("No sandbox");
    // Permissionless attacker operation. Here the connected wallet invokes it
    // to simulate what an independent attacker would do after malicious approval.
    await send(drainerAddress, drainerAbi, "drain", [tokenAddress, sandbox, BUDGET]);
    await refresh(sandbox);
  };

  const withdraw = async () => {
    if (!sandbox) throw Error("No sandbox");
    await send(sandbox, sandboxAbi, "withdrawToken", [tokenAddress]);
    await refresh(sandbox);
  };

  return <main className="app">
    <header className="header"><div className="brand">◈ <strong>CONTAIN</strong> <span>Security sandbox</span></div><span className="pill">Sepolia testnet • Demo</span></header>
    <section className="hero"><p className="eyebrow">ZERO TRUST • ON-CHAIN ASSET ISOLATION</p><h1>Explore Web3. <em>Expose less.</em></h1><p>Give an unfamiliar dApp a separate 20 USDC test balance—never your main wallet's permissions.</p></section>
    {!deployed && <div className="warning">Configure deployed contract addresses in <code>web/.env</code> before using the demo.</div>}
    <div className="columns">
      <section className="panel">
        <h2>① Main wallet</h2>
        <p>Connect your MetaMask account to authorize setup and pay transaction gas.</p>
        {isConnected ? <><div className="stat">{owner ? SHORT(owner) : ""}</div><button className="secondary" onClick={() => disconnect()} disabled={!!busy}>Disconnect</button></>
          : <button onClick={() => void run("Connect wallet", async () => { await connectAsync({ connector: connectors[0] }); })} disabled={!connectors.length || !!busy || connecting}>Connect MetaMask</button>}
        {isConnected && !chainOk && <button onClick={() => void run("Switch chain", async () => { await switchChainAsync({ chainId: sepolia.id }); })}>Switch to Sepolia</button>}
        <div className="balance"><span>Demo token balance</span><strong>{USD(balances.main)} dUSDC</strong></div>
        <button disabled={!chainOk || !deployed || !!busy} className="secondary" onClick={() => void run("Claim demo tokens", async () => { await send(tokenAddress, tokenAbi, "faucet"); await refresh(); })}>Claim 1,000 demo USDC</button>
      </section>
      <section className="panel accent">
        <h2>② Contain sandbox</h2>
        <p>A new smart-contract wallet that holds exactly 20 demo USDC initially.</p>
        <div className="stat">{sandbox ? SHORT(sandbox) : "Not created"}</div>
        <div className="balance"><span>Sandbox balance</span><strong>{USD(balances.sandbox)} dUSDC</strong></div>
        {!sandbox ? <button disabled={!chainOk || !deployed || !!busy} onClick={() => void run("Create sandbox", createSandbox)}>Create $20 sandbox</button> : <>
          <button disabled={!chainOk || !!busy || fundedOnce} onClick={() => void run("Fund sandbox", fundSandbox)}>Approve & fund 20 dUSDC</button>
          <button className="secondary" disabled={!chainOk || !!busy || balances.sandbox === 0n} onClick={() => void run("Recover remaining funds", withdraw)}>Recover remaining tokens</button>
        </>}
        <small>Do not refill a sandbox after it has interacted with an untrusted contract. Unlimited approvals can remain active.</small>
      </section>
    </div>
    <section className="panel demo">
      <div className="sectionTitle"><div><h2>③ Simulated malicious dApp</h2><p>A third-party dApp receives only the sandbox address via a constrained EIP-1193-style provider.</p></div><span className="pill danger">Controlled exploit demo</span></div>
      <div className="timeline">
        <div><span className="step">1</span><h3>Connect protected account</h3><p>The dApp sees the sandbox, not your MetaMask address.</p><button disabled={!provider || balances.sandbox === 0n || !!busy || walletConnectedToDapp} onClick={() => void run("Connect dApp", connectDapp)}>{walletConnectedToDapp ? "Protected connection active" : "Connect with Contain"}</button></div>
        <div><span className="step">2</span><h3>Malicious token approval</h3><p>This intentionally requests an unlimited allowance—but only from the sandbox.</p><button className="dangerButton" disabled={!walletConnectedToDapp || !!busy || approvedBySandbox} onClick={() => void run("Grant risky sandbox approval", approveMaliciousDapp)}>{approvedBySandbox ? "Sandbox approval granted" : "Simulate malicious approval"}</button></div>
        <div><span className="step">3</span><h3>Attacker drains tokens</h3><p>An externally callable attacker contract steals the sandbox's 20 dUSDC.</p><button className="dangerButton" disabled={!approvedBySandbox || balances.sandbox < BUDGET || !!busy} onClick={() => void run("Simulate attacker", drainDemo)}>Simulate attacker drain</button></div>
      </div>
      <div className="result"><div><span>Main wallet</span><strong>{USD(balances.main)} dUSDC</strong><small>Remains isolated</small></div><div><span>Sandbox</span><strong>{USD(balances.sandbox)} dUSDC</strong><small>Limited initial balance</small></div><div><span>Attacker contract</span><strong>{USD(balances.drainer)} dUSDC</strong><small>Captured test tokens</small></div></div>
      <p className="notice" role="status">{busy ? "⏳ " : "ℹ "}{notice}</p>
    </section>
    <footer>TESTNET ONLY. Demonstrates separation of existing main-wallet holdings, not privacy, production safety, arbitrary dApp compatibility, or a perpetual $20 loss cap.</footer>
  </main>;
}
