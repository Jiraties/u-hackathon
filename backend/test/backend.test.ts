import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import request from 'supertest';
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex, type Abi, toHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { createApp } from '../src/app.js';
import { commitment, randomId, passwordHash } from '../src/crypto.js';
import { simulate } from '../src/simulator.js';
import type { Config } from '../src/config.js';
import { createChain, type ChainGateway } from '../src/chain.js';
import { connectStore } from '../src/store.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const local = defineChain({ id: 31337, name: 'test', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:18545'] } } });
const client = createPublicClient({ chain: local, transport: http(local.rpcUrls.default.http[0], { retryCount: 0, timeout: 1000 }) });
const wallet = createWalletClient({ chain: local, transport: http(local.rpcUrls.default.http[0]) });
let processHandle: ChildProcess, address: Address, accounts: Address[], abi: Abi, bytecode: Hex;
let chain: ChainGateway;
let output = '';
before(async () => {
  processHandle = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1', '--port', '18545'], { stdio: ['ignore', 'pipe', 'pipe'] });
  processHandle.stdout?.on('data', data => { output = (output + data).slice(-4000); });
  processHandle.stderr?.on('data', data => { output = (output + data).slice(-4000); });
  for (let i = 0; i < 100; i++) {
    if (processHandle.exitCode !== null) throw new Error(output);
    try { await client.getChainId(); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    if (i === 99) throw new Error(output);
  }
  accounts = await wallet.getAddresses();
  ({ abi, bytecode } = JSON.parse(fs.readFileSync('artifacts/FairPassRegistry.json', 'utf8')));
  const hash = await wallet.deployContract({ account: accounts[0], abi, bytecode, args: [accounts[0], accounts[1]] });
  address = (await client.waitForTransactionReceipt({ hash })).contractAddress!;
  await write(accounts[0], 'authorizeInstitution', [accounts[2], true]);
  const mnemonic = 'test test test test test test test test test test test junk';
  const authorityKey = toHex(mnemonicToAccount(mnemonic, { addressIndex: 1 }).getHdKey().privateKey!);
  const issuerKey = toHex(mnemonicToAccount(mnemonic, { addressIndex: 2 }).getHdKey().privateKey!);
  chain = createChain({ CHAIN_ID: 31337, RPC_URL: local.rpcUrls.default.http[0], CONTRACT_ADDRESS: address,
    DEPLOYMENT_BLOCK: 0n, AUTHORITY_PRIVATE_KEY: authorityKey, ISSUER_PRIVATE_KEY: issuerKey } as Config);
  await chain.ready();
});
after(() => { processHandle?.kill('SIGTERM'); });
async function write(account: Address, functionName: string, args: readonly unknown[]) {
  const { request: tx } = await client.simulateContract({ address, abi, functionName, args, account });
  const transactionHash = await wallet.writeContract(tx);
  const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
  assert.equal(receipt.status, 'success');
  return { chainId: 31337, contractAddress: address, transactionHash, blockNumber: String(receipt.blockNumber) };
}
const zero = `0x${'0'.repeat(64)}` as Hex;
async function offer(program: Hex, subject = randomId(), year = 2027) {
  const resultId = randomId();
  await write(accounts[1], 'recordResult', [resultId, randomId(), subject, program, year, true]);
  await write(accounts[1], 'confirmResult', [resultId]);
  return resultId;
}
test('EVM enforces authority, locked rules, authenticated confirmation, capacity and explicit seat reuse', async () => {
  const p = randomId(), rule = randomId();
  await assert.rejects(write(accounts[3], 'registerProgram', [p, 2027, 1, rule]));
  await write(accounts[2], 'registerProgram', [p, 2027, 1, rule]);
  await assert.rejects(offer(p)); // no result before rule lock
  await write(accounts[2], 'lockRules', [p]);
  await assert.rejects(write(accounts[2], 'reviseProgram', [p, 2, randomId(), randomId()]));
  const pending = randomId();
  await assert.rejects(write(accounts[3], 'recordResult', [pending, randomId(), randomId(), p, 2027, true]));
  await write(accounts[1], 'recordResult', [pending, randomId(), randomId(), p, 2027, true]);
  await assert.rejects(write(accounts[2], 'issueRight', [randomId(), pending]));
  await write(accounts[1], 'confirmResult', [pending]);
  const right = randomId();
  await write(accounts[2], 'issueRight', [right, pending]);
  await assert.rejects(write(accounts[2], 'issueRight', [randomId(), pending]));
  const other = await offer(p);
  // Send a transaction to the EVM with a gas limit instead of stopping at simulation.
  const hash = await wallet.writeContract({ address, abi, functionName: 'issueRight', args: [randomId(), other], account: accounts[2], gas: 500000n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, 'reverted');
  assert.equal((await chain.read('programs', [p]))[3], 1);
  await write(accounts[2], 'changeStatus', [right, 2, randomId()]);
  assert.equal((await chain.read('programs', [p]))[3], 1); // enrolled still occupies seat
  await write(accounts[2], 'changeStatus', [right, 3, randomId()]);
  assert.equal((await chain.read('programs', [p]))[3], 0);
  await assert.rejects(write(accounts[2], 'issueRight', [randomId(), other]));
  await write(accounts[2], 'authorizeReallocation', [p, 1, randomId()]);
  const replacement = randomId(); await write(accounts[2], 'issueRight', [replacement, other]);
  assert.equal((await chain.read('programs', [p]))[4], 2);
  await assert.rejects(write(accounts[2], 'changeStatus', [right, 1, randomId()]));
  await write(accounts[2], 'changeStatus', [replacement, 4, randomId()]);
  assert.equal((await chain.read('credential', [replacement]))[1], 4);
});
test('EVM prevents multiple active rights per subject/year, non-admitted rights, duplicate results and unauthorized lifecycle writes', async () => {
  const p = randomId(), p2 = randomId(), subject = randomId();
  for (const id of [p, p2]) { await write(accounts[2], 'registerProgram', [id, 2027, 2, randomId()]); await write(accounts[2], 'lockRules', [id]); }
  const r1 = await offer(p, subject), r2 = await offer(p2, subject), right = randomId();
  await write(accounts[2], 'issueRight', [right, r1]);
  await assert.rejects(write(accounts[2], 'issueRight', [randomId(), r2]));
  await assert.rejects(write(accounts[3], 'changeStatus', [right, 4, randomId()]));
  const rejected = randomId();
  await write(accounts[1], 'recordResult', [rejected, randomId(), randomId(), zero, 2027, false]);
  await assert.rejects(write(accounts[1], 'confirmResult', [rejected]));
  await assert.rejects(write(accounts[1], 'recordResult', [rejected, randomId(), randomId(), zero, 2027, false]));
  await write(accounts[0], 'pause', []);
  await assert.rejects(write(accounts[2], 'changeStatus', [right, 3, randomId()]));
  assert.equal((await chain.read('credential', [right]))[1], 1); // reads survive pause
  await write(accounts[0], 'unpause', []);
  await write(accounts[0], 'authorizeInstitution', [accounts[2], false]);
  await assert.rejects(write(accounts[2], 'changeStatus', [right, 3, randomId()]));
  await write(accounts[0], 'authorizeInstitution', [accounts[2], true]);
  const mnemonic = 'test test test test test test test test test test test junk';
  const authorityKey = toHex(mnemonicToAccount(mnemonic, { addressIndex: 1 }).getHdKey().privateKey!);
  const issuerKey = toHex(mnemonicToAccount(mnemonic, { addressIndex: 2 }).getHdKey().privateKey!);
  chain = createChain({ CHAIN_ID: 31337, RPC_URL: local.rpcUrls.default.http[0], CONTRACT_ADDRESS: address,
    DEPLOYMENT_BLOCK: 0n, AUTHORITY_PRIVATE_KEY: authorityKey, ISSUER_PRIVATE_KEY: issuerKey } as Config);
  await chain.ready();
});
test('API runs admitted and non-admitted journeys against EVM, isolates student records and retries durable intent', async (t) => {
  const mongo = await MongoMemoryServer.create({ binary: { downloadDir: path.resolve('cache/mongodb') } });
  t.after(() => mongo.stop());
  const connection = await connectStore(mongo.getUri(), 'fairpass_test');
  t.after(() => connection.close());
  const store = connection.store;
  const config = { ADMIN_API_TOKEN: 'admin'.repeat(10), INTEGRATION_API_TOKEN: 'integration'.repeat(4), ISSUER_API_TOKEN: 'issuer'.repeat(7), CORS_ORIGIN: 'http://localhost:5173' } as Config;
  const app = createApp(config, store, chain);
  const auth = (token: string) => `Bearer ${token}`;
  const issuer = auth(config.ISSUER_API_TOKEN), integration = auth(config.INTEGRATION_API_TOKEN);
  const password = 'fictional-test-password';
  for (const name of ['pim', 'narin']) await store.students.insertOne({ _id: name, name, passwordHash: await passwordHash(password) });
  const login = async (studentId: string) => (await request(app).post('/v1/auth/login').send({ studentId, password }).expect(200)).body.token;
  const pimToken = auth(await login('pim')), narinToken = auth(await login('narin'));
  await request(app).get('/v1/me/wallet').expect(401);
  await request(app).post('/v1/integration/results').send({}).expect(401);
  const p = randomId();
  const registration = { programId: p, academicYear: 2027, capacity: 1, rules: { name: 'Fictional', weights: { math: 10000 }, minimumScore: 50, tieBreak: 'opaque-applicant-id-ascending', fictional: true } };
  await request(app).post('/v1/issuer/programs').set('Authorization', issuer).send(registration).expect(201);
  await request(app).post('/v1/issuer/programs').set('Authorization', issuer).send(registration).expect(201);
  await request(app).post('/v1/issuer/programs').set('Authorization', issuer).send({ ...registration, capacity: 2 }).expect(409);
  const event = { eventId: 'event-pim', studentId: 'pim', academicYear: 2027, round: 'fictional-3', outcome: 'admitted', programId: p, scores: { math: 95 }, preferences: [p], trace: [], source: 'fictional-simulator' };
  const recorded = (await request(app).post('/v1/integration/results').set('Authorization', integration).send(event).expect(201)).body;
  const again = (await request(app).post('/v1/integration/results').set('Authorization', integration).send(event).expect(201)).body;
  assert.equal(again.resultId, recorded.resultId);
  await request(app).post('/v1/integration/results').set('Authorization', integration).send({ ...event, scores: { math: 96 } }).expect(409);
  await request(app).get(`/v1/me/results/${recorded.resultId}/proof`).set('Authorization', narinToken).expect(404);
  await request(app).post(`/v1/issuer/results/${recorded.resultId}/issue`).set('Authorization', issuer).send({}).expect(409);
  await request(app).post(`/v1/me/results/${recorded.resultId}/confirm`).set('Authorization', pimToken).send({}).expect(200);
  const issued = (await request(app).post(`/v1/issuer/results/${recorded.resultId}/issue`).set('Authorization', issuer).send({}).expect(200)).body;
  assert.equal(issued.status, 'valid');
  // Mimic Mongo update loss after mined issuance. Retry recovers by deterministic ID.
  const doc = await store.results.findOne({ resultId: recorded.resultId });
  await store.results.updateOne({ _id: doc!._id }, { $set: { issuance: undefined } });
  const retried = (await request(app).post(`/v1/issuer/results/${recorded.resultId}/issue`).set('Authorization', issuer).send({}).expect(200)).body;
  assert.equal(retried.credentialId, issued.credentialId);
  const proof = (await request(app).get(`/v1/me/results/${recorded.resultId}/proof`).set('Authorization', pimToken).expect(200)).body;
  assert.equal(proof.verification.resultIntegrity, 'verified');
  assert.equal(proof.verification.allocationCorrectness, 'not_verified');
  assert.notEqual(commitment({ ...proof.report, scores: { math: 0 } }, proof.salt), proof.onchainCommitment);
  const verified = (await request(app).get(`/v1/public/verify/${issued.credentialId}`).expect(200)).body;
  for (const secret of ['studentId', 'scores', 'salt', 'subject', 'name', 'report', 'resultId']) assert.equal(secret in verified, false);
  await request(app).get(`/v1/public/verify/${randomId()}`).expect(404);
  const publicPrograms = (await request(app).get('/v1/public/programs').expect(200)).body;
  assert.equal(publicPrograms[0].active, 1); assert.equal(publicPrograms[0].rulesMatch, true);
  const history = (await request(app).get(`/v1/public/programs/${p}/events`).expect(200)).body;
  assert.ok(history.events.some((event: any) => event.event === 'RightIssued'));
  assert.ok(history.events.every((event: any) => event.args.program === p));
  const unavailable = createApp(config, store, { ...chain, async read() { throw new Error('offline'); } });
  assert.equal((await request(unavailable).get(`/v1/public/verify/${issued.credentialId}`).expect(503)).body.status, 'verification_unavailable');
  const rejected = (await request(app).post('/v1/integration/results').set('Authorization', integration).send({ ...event, eventId: 'event-narin', studentId: 'narin', outcome: 'not_admitted', programId: null, scores: { math: 60 } }).expect(201)).body;
  await request(app).post(`/v1/me/results/${rejected.resultId}/confirm`).set('Authorization', narinToken).send({}).expect(409);
  const walletView = (await request(app).get('/v1/me/wallet').set('Authorization', narinToken).expect(200)).body;
  assert.equal(walletView.records.length, 1); assert.equal(walletView.records[0].credential, null);
  // Tampering with a private report must invalidate the live integrity check.
  const rejectDoc = await store.results.findOne({ resultId: rejected.resultId });
  await store.results.updateOne({ _id: rejectDoc!._id }, { $set: { report: { ...rejectDoc!.report, scores: { math: 1 } } } });
  const invalidProof = (await request(app).get(`/v1/me/results/${rejected.resultId}/proof`).set('Authorization', narinToken).expect(200)).body;
  assert.equal(invalidProof.verification.resultIntegrity, 'not_verified');
  await request(app).post('/v1/auth/logout').set('Authorization', narinToken).send({}).expect(204);
  await request(app).get('/v1/me/wallet').set('Authorization', narinToken).expect(401);
  const reconnected = await connectStore(mongo.getUri(), 'fairpass_test');
  assert.equal((await reconnected.store.results.findOne({ resultId: recorded.resultId }))!.commitment, recorded.commitment);
  await assert.rejects(reconnected.store.results.insertOne(doc!));
  await reconnected.close();
});
test('fictional matching follows preferences, capacities, deterministic ties and eligibility', () => {
  const programs = [{ id: 'a', capacity: 1, minimumScore: 50, weights: { math: 10000 } }, { id: 'b', capacity: 1, minimumScore: 50, weights: { math: 10000 } }];
  const applicants = [
    { id: 'z', scores: { math: 90 }, preferences: ['a', 'b'] },
    { id: 'a', scores: { math: 90 }, preferences: ['a'] },
    { id: 'low', scores: { math: 40 }, preferences: ['b'] },
  ];
  const result = simulate(programs, applicants);
  assert.equal(result.find(r => r.studentId === 'a')!.programId, 'a');
  assert.equal(result.find(r => r.studentId === 'z')!.programId, 'b');
  assert.equal(result.find(r => r.studentId === 'low')!.outcome, 'not_admitted');
  const reversed = simulate(programs, [...applicants].reverse());
  for (const row of result) assert.deepEqual(reversed.find(r => r.studentId === row.studentId), row);
  assert.throws(() => simulate(programs, [{ id: 'missing', scores: {}, preferences: ['a'] }]));
  assert.throws(() => simulate(programs, [{ ...applicants[0], preferences: ['a', 'a'] }]));
});

test('deployment, bootstrap, server, fictional demo and independent verification CLIs work end-to-end', async () => {
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const run = promisify(execFile);
  const mnemonic = 'test test test test test test test test test test test junk';
  const key = (index: number) => toHex(mnemonicToAccount(mnemonic, { addressIndex: index }).getHdKey().privateKey!);
  const mongo = await MongoMemoryServer.create({ binary: { downloadDir: path.resolve('cache/mongodb') } });
  let server: ChildProcess | undefined;
  let logs = '';
  try {
    // Exercise colored CLI output even when CI captures stdout without a TTY.
    const env = { ...process.env, FORCE_COLOR: '1', CHAIN_ID: '31337', RPC_URL: local.rpcUrls.default.http[0],
      ADMIN_PRIVATE_KEY: key(0), ADMIN_ADDRESS: '', AUTHORITY_PRIVATE_KEY: key(1), ISSUER_PRIVATE_KEY: key(2),
      ADMIN_API_TOKEN: 'cli-admin-token'.repeat(3), ISSUER_API_TOKEN: 'cli-issuer-token'.repeat(3), INTEGRATION_API_TOKEN: 'cli-integration-token'.repeat(3),
      MONGODB_URI: mongo.getUri(), MONGODB_DATABASE: 'fairpass_cli', PORT: '18547', API_URL: 'http://127.0.0.1:18547',
      DEMO_PASSWORD: 'fictional-cli-test-password', CORS_ORIGIN: 'http://localhost:5173', CONTRACT_ADDRESS: '', DEPLOYMENT_BLOCK: '0' };
    const deployment = await run(process.execPath, ['--import', 'tsx', 'scripts/deploy.ts'], { env });
    const match = stripVTControlCharacters(deployment.stdout).match(/Set CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40}) and DEPLOYMENT_BLOCK=(\d+)/)!;
    assert.ok(match, deployment.stdout);
    env.CONTRACT_ADDRESS = match[1]; env.DEPLOYMENT_BLOCK = match[2];
    await run(process.execPath, ['--import', 'tsx', 'scripts/bootstrap.ts'], { env });
    server = spawn(process.execPath, ['dist/src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout?.on('data', data => { logs += data; });
    server.stderr?.on('data', data => { logs += data; });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { const response = await fetch(`${env.API_URL}/ready`); if (response.ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const demo = await run(process.execPath, ['--import', 'tsx', 'scripts/demo.ts'], { env });
    const demoOutput = stripVTControlCharacters(demo.stdout);
    assert.match(demoOutput, /resultIntegrity: 'verified'/);
    assert.match(demoOutput, /outcome: 'not_admitted'/);
    const credential = demoOutput.match(/credentialId: '(0x[0-9a-fA-F]{64})'/);
    assert.ok(credential, 'Demo output must include the issued credential ID');
    const credentialId = credential[1];
    const verification = await run(process.execPath, ['--import', 'tsx', 'scripts/verify.ts', credentialId], { env });
    assert.match(stripVTControlCharacters(verification.stdout), /status: 'valid'/);
  } finally {
    if (server && server.exitCode === null) {
      const stopped = new Promise(resolve => server!.once('exit', resolve));
      server.kill('SIGTERM'); await stopped;
    }
    await mongo.stop();
  }
});
