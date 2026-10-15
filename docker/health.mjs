const [mode] = process.argv.slice(2);
try {
  if (mode === 'chain') {
    const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    if (!response.ok || body.result !== '0x7a69') process.exit(1);
  } else {
    const response = await fetch('http://127.0.0.1:3001/ready', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) process.exit(1);
  }
} catch { process.exit(1); }
