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
    const {createServer}=await import('node:net');
    const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
    const apiPort=(probe.address() as import('node:net').AddressInfo).port;
    await new Promise<void>(resolve=>probe.close(()=>resolve()));
    // Exercise colored CLI output even when CI captures stdout without a TTY.
    const env = { ...process.env, FORCE_COLOR: '1', CHAIN_ID: '31337', RPC_URL: local.rpcUrls.default.http[0],
      ADMIN_PRIVATE_KEY: key(0), ADMIN_ADDRESS: '', AUTHORITY_PRIVATE_KEY: key(1), ISSUER_PRIVATE_KEY: key(2),
      ADMIN_API_TOKEN: 'cli-admin-token'.repeat(3), ISSUER_API_TOKEN: 'cli-issuer-token'.repeat(3), INTEGRATION_API_TOKEN: 'cli-integration-token'.repeat(3),
      MONGODB_URI: mongo.getUri(), MONGODB_DATABASE: 'fairpass_cli', PORT: String(apiPort), API_URL: `http://127.0.0.1:${apiPort}`, REGISTRY_VERSION: '1',
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

test('shared rulebook publication and persisted simulation enforce institutional boundaries and a single intake', async(t)=>{
  const {rulebookCommitment, canonicalRulebook, evaluateRulebook, allocatePreview}=await import('../shared/domain.js');
  const {createHash}=await import('node:crypto');
  const mongo=await MongoMemoryServer.create({binary:{downloadDir:path.resolve('cache/mongodb')}});
  t.after(()=>mongo.stop());
  const connection=await connectStore(mongo.getUri(),'fairpass_shared');t.after(()=>connection.close());
  const store=connection.store;
  const config={ADMIN_API_TOKEN:'a'.repeat(40),ISSUER_API_TOKEN:'i'.repeat(40),INTEGRATION_API_TOKEN:'x'.repeat(40),INSTITUTION_ID:'fairpass-demo',CORS_ORIGIN:'http://localhost:5173'} as Config;
  const app=createApp(config,store,chain), password='fictional-shared-test-password';
  for(const studentId of ['shared-a','shared-z'])await store.students.insertOne({_id:studentId,name:studentId,passwordHash:await passwordHash(password)});
  await request(app).post('/v1/admin/operators').set('Authorization',`Bearer ${config.ADMIN_API_TOKEN}`).send({operatorId:'shared-office',institutionId:'fairpass-demo',name:'Office',password}).expect(201);
  const office=(await request(app).post('/v1/auth/institution/login').send({operatorId:'shared-office',password}).expect(200)).body.token;
  const student=(await request(app).post('/v1/auth/login').send({studentId:'shared-z',password}).expect(200)).body.token;
  const authOffice=`Bearer ${office}`,authStudent=`Bearer ${student}`;
  const rule:import('../shared/domain.js').AdmissionRulebook={id:'shared-rule',programId:'shared-engineering',institutionId:'fairpass-demo',programName:'Fictional Engineering',faculty:'Engineering',academicYear:2028,round:'shared-round',capacity:1,version:1,method:'normalized-weighted-sum',components:[{scoreId:'gpax',label:'GPAX',source:'demo-school-record',sourceComponentId:'GPAX',maximum:4,transformation:'normalize-to-100',weightPercent:100,minimumPercent:50}],requiredSubjects:['gpax'],qualifications:[{field:'curriculum',equals:'Science–Mathematics'}],status:'draft',createdAt:new Date().toISOString(),sealedAt:null,commitment:null,chainReference:null,publication:null};
  await request(app).get('/v1/office/workspace').set('Authorization',authStudent).expect(401);
  const directory=(await request(app).get('/v1/office/students').set('Authorization',authOffice).expect(200)).body;
  assert.deepEqual(Object.keys(directory[0]).sort(),['id','name']);
  await request(app).post('/v1/office/rulebooks/drafts').set('Authorization',authOffice).send({rule,expectedRevision:0}).expect(200);
  await request(app).post('/v1/office/rulebooks/drafts').set('Authorization',authOffice).send({rule,expectedRevision:0}).expect(409);
  assert.equal((await request(app).get('/v1/office/workspace').set('Authorization',authOffice).expect(200)).body.drafts[0].revision,1);
  await request(app).post('/v1/office/rulebooks/drafts').set('Authorization',authOffice).send({rule:{...rule,institutionId:'other'},expectedRevision:1}).expect(403);
  const hash=await rulebookCommitment(rule);
  assert.equal(hash,'0x'+createHash('sha256').update(canonicalRulebook(rule)).digest('hex'));
  for(const mutation of [{degree:'Bachelor of Engineering'},{capacity:2},{round:'different'},{requiredSubjects:[]},{qualifications:[]},{version:2},{components:[{...rule.components[0],minimumPercent:51}]}])
    assert.notEqual(await rulebookCommitment({...rule,...mutation}),hash);
  await request(app).post('/v1/office/rulebooks/publish').set('Authorization',authStudent).send(rule).expect(401);
  await request(app).get('/v1/me/wallet').set('Authorization',authOffice).expect(401);
  await request(app).post('/v1/office/rulebooks/publish').set('Authorization',authOffice).send({...rule,institutionId:'other'}).expect(403);
  const published=(await request(app).post('/v1/office/rulebooks/publish').set('Authorization',authOffice).send(rule).expect(201)).body;
  await request(app).post('/v1/office/rulebooks/drafts').set('Authorization',authOffice).send({rule,expectedRevision:1}).expect(409);
  assert.equal(published.rulesHash,hash);assert.ok(published.lock.transactionHash);
  const retry=(await request(app).post('/v1/office/rulebooks/publish').set('Authorization',authOffice).send(rule).expect(201)).body;
  assert.equal(retry.lock.transactionHash,published.lock.transactionHash);
  await request(app).post('/v1/office/rulebooks/publish').set('Authorization',authOffice).send({...rule,id:'shared-rule-v2',version:2}).expect(409);
  const score=(value:number)=>[{id:'gpax',subject:'GPAX',label:'GPAX',score:value,maximum:4,provenance:'simulated-exam-provider' as const}];
  const applicants=[{id:'shared-a',scores:score(3.60001),preferences:[rule.programId],qualifications:{curriculum:'Science–Mathematics'}},{id:'shared-z',scores:score(3.60002),preferences:[rule.programId],qualifications:{curriculum:'Science–Mathematics'}}];
  assert.deepEqual(allocatePreview([rule],applicants),{'shared-a':null,'shared-z':rule.programId}); // same display score, different raw ranking
  const evaluated=evaluateRulebook(rule,score(3.6),{curriculum:'Science–Mathematics'});assert.equal(evaluated.status,'calculated');if(evaluated.status==='calculated')assert.equal(evaluated.total,90);
  const payload={runId:'shared-run',programIds:[published.programId],applicants};
  await request(app).post('/v1/office/simulations').set('Authorization',authStudent).send(payload).expect(401);
  await request(app).post('/v1/office/simulations').set('Authorization',authOffice).send({...payload,programIds:[randomId()]}).expect(403);
  const processed=(await request(app).post('/v1/office/simulations').set('Authorization',authOffice).send(payload).expect(201)).body;
  assert.deepEqual((await request(app).get('/v1/office/simulations/shared-run').set('Authorization',authOffice).expect(200)).body,payload);
  await request(app).get('/v1/office/simulations/shared-run').set('Authorization',authStudent).expect(401);
  assert.deepEqual(processed.assignments,allocatePreview([rule],applicants));
  await request(app).post('/v1/office/simulations').set('Authorization',authOffice).send(payload).expect(201);
  await request(app).post('/v1/office/simulations').set('Authorization',authOffice).send({...payload,runId:'second-run'}).expect(409);
  assert.equal((await store.results.find({}).toArray()).length,2);
  const view=(await request(app).get('/v1/me/wallet').set('Authorization',authStudent).expect(200)).body;
  const result=view.records[0];assert.equal(result.report.outcome,'admitted');assert.equal(result.credential,null);assert.equal(result.report.rulebooks[0].id,rule.id);
  const other=(await store.results.findOne({studentId:'shared-a'}))!;
  await request(app).get(`/v1/me/results/${other.resultId}/proof`).set('Authorization',authStudent).expect(404);
  await request(app).post(`/v1/issuer/results/${result.resultId}/issue`).set('Authorization',authStudent).send({}).expect(401);
  await request(app).post(`/v1/me/results/${result.resultId}/confirm`).set('Authorization',authStudent).send({}).expect(200);
  const issued=(await request(app).post(`/v1/issuer/results/${result.resultId}/issue`).set('Authorization',authOffice).send({}).expect(200)).body;
  assert.ok(issued.issuance.transactionHash);
  assert.equal((await request(app).post(`/v1/issuer/results/${result.resultId}/issue`).set('Authorization',authOffice).send({}).expect(200)).body.credentialId,issued.credentialId);
  const officeResults=(await request(app).get('/v1/office/results').set('Authorization',authOffice).expect(200)).body;assert.equal(officeResults.length,2);
  await request(app).post(`/v1/issuer/credentials/${issued.credentialId}/status`).set('Authorization',authOffice).send({status:'enrolled',reasonCommitment:randomId()}).expect(200);
  assert.equal((await request(app).get(`/v1/public/verify/${issued.credentialId}`).expect(200)).body.lifecycle,'enrolled');
  const publicView=(await request(app).get('/v1/public/programs').expect(200)).body[0];assert.equal(publicView.rulesMatch,true);assert.equal(publicView.rulebook.id,rule.id);assert.equal(publicView.rulebook.status,'published');assert.equal(result.report.rulebooks[0].commitment,hash);
  await request(app).post('/v1/auth/institution/logout').set('Authorization',authOffice).send({}).expect(204);
  await request(app).get('/v1/office/results').set('Authorization',authOffice).expect(401);
});

test('browser: publish rules → process cohort → student confirmation → institutional issue → public verification', {skip:process.env.FAIRPASS_BROWSER_TEST!=='1'}, async(t)=>{
  try {
  const {chromium}=await import('playwright');
  const {default:express}=await import('express');
  const mongo=await MongoMemoryServer.create({binary:{downloadDir:path.resolve('cache/mongodb')}});t.after(()=>mongo.stop());
  const connection=await connectStore(mongo.getUri(),'fairpass_browser');t.after(()=>connection.close());
  const config={ADMIN_API_TOKEN:'a'.repeat(40),ISSUER_API_TOKEN:'i'.repeat(40),INTEGRATION_API_TOKEN:'x'.repeat(40),INSTITUTION_ID:'fairpass-demo',CORS_ORIGIN:'http://localhost:5173'} as Config;
  const password='fictional-browser-password';
  for(const studentId of ['browser-pim','browser-narin'])await connection.store.students.insertOne({_id:studentId,name:studentId,passwordHash:await passwordHash(password)});
  await connection.store.operators.insertOne({_id:'browser-office',name:'Office',institutionId:'fairpass-demo',passwordHash:await passwordHash(password)});
  const host=express();host.use('/api',createApp(config,connection.store,chain));host.use(express.static(path.resolve('../web/dist')));host.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('../web/dist/index.html')));
  const server=host.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',()=>resolve()));
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const office=await browser.newPage({viewport:{width:1440,height:1000}}),student=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors:string[]=[];for(const page of [office,student])page.on('pageerror',error=>errors.push(error.message));
  const {browserJourney}=await import('../scripts/browser-journey.js');
  async function capture(page:import('playwright').Page,name:string){
    await page.evaluate(()=>document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();else a.pause();}));
    await page.screenshot({path:path.resolve('cache/connected-'+name+'-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();else a.pause();}));
    await page.screenshot({path:path.resolve('cache/connected-'+name+'-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' fits mobile');
    await page.setViewportSize({width:1440,height:1000});
  }
  const credentialId=await browserJourney({office,student,base,operatorId:'browser-office',studentId:'browser-pim',rejectedId:'browser-narin',password,round:'browser-round',capture});
  assert.equal((await chain.read('credential',[credentialId]))[1],1);
  await student.goto(base+'/verify/0x'+'f'.repeat(64));await student.getByRole('heading',{name:'Token not found',exact:true}).waitFor();
  await student.route('**/api/v1/public/verify/*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({status:'verification_unavailable'})}));
  await student.goto(base+'/verify/'+credentialId);await student.getByRole('alert').waitFor();assert.equal(await student.getByRole('heading',{name:'Valid admission right',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  } catch(error) { console.error(error); throw error; }
});

test('judge demo access only issues local fictional sessions and preserves normal authentication',async(t)=>{
 const previousLocal=process.env.FAIRPASS_LOCAL;
 t.after(()=>{if(previousLocal===undefined)delete process.env.FAIRPASS_LOCAL;else process.env.FAIRPASS_LOCAL=previousLocal;});
 process.env.FAIRPASS_LOCAL='true';
 const mongo=await MongoMemoryServer.create({binary:{downloadDir:path.resolve('cache/mongodb')}});
 t.after(()=>mongo.stop());
 const connection=await connectStore(mongo.getUri(),'judge_access');t.after(()=>connection.close());
 const store=connection.store;
 await store.students.insertOne({_id:'demo-pim',name:'Pim (fictional)',passwordHash:await passwordHash('password')});
 await store.students.insertOne({_id:'private-student',name:'Private student',passwordHash:await passwordHash('private-password')});
 await store.operators.insertOne({_id:'demo-office',name:'Demo officer',institutionId:'fairpass-demo',passwordHash:await passwordHash('password')});
 const config={ADMIN_API_TOKEN:'a'.repeat(40),ISSUER_API_TOKEN:'i'.repeat(40),INTEGRATION_API_TOKEN:'x'.repeat(40),INSTITUTION_ID:'fairpass-demo',CORS_ORIGIN:'http://localhost:5173',CHAIN_ID:31337,DEMO_JUDGE_ACCESS:true,DEMO_READ_ONLY:false} as Config;
 const app=createApp(config,store,chain);
 t.after(()=>app.locals.closeScoring());
 const available=(await request(app).get('/v1/auth/demo-access').expect(200)).body;
 assert.equal(available.enabled,true);assert.equal(available.institution,true);
 assert.deepEqual(available.students,[{id:'demo-pim',name:'Pim (new result)',hasResults:false}]);
 assert.equal(JSON.stringify(available).includes('passwordHash'),false);
 await request(app).post('/v1/auth/demo-access').send({role:'student',studentId:'private-student'}).expect(404);
 await request(app).post('/v1/auth/demo-access').send({role:'institution',operatorId:'any-account'}).expect(400);
 const student=(await request(app).post('/v1/auth/demo-access').send({role:'student',studentId:'demo-pim'}).expect(200)).body;
 assert.equal(student.demo,true);assert.ok(Date.parse(student.expiresAt)-Date.now()<=60*60*1000);
 await request(app).get('/v1/me/wallet').auth(student.token,{type:'bearer'}).expect(200);
 await request(app).get('/v1/office/workspace').auth(student.token,{type:'bearer'}).expect(401);
 const institution=(await request(app).post('/v1/auth/demo-access').send({role:'institution'}).expect(200)).body;
 await request(app).get('/v1/office/workspace').auth(institution.token,{type:'bearer'}).expect(200);
 await request(app).get('/v1/me/wallet').auth(institution.token,{type:'bearer'}).expect(401);
 await request(app).post('/v1/auth/institution/login').send({operatorId:'demo-office',password:'wrong'}).expect(401);
 for(const patch of [{DEMO_JUDGE_ACCESS:false},{CHAIN_ID:43113},{CHAIN_ID:43114},{DEMO_READ_ONLY:true}]){
  const disabled=createApp({...config,...patch} as Config,store,chain);t.after(()=>disabled.locals.closeScoring());
  assert.equal((await request(disabled).get('/v1/auth/demo-access').expect(200)).body.enabled,false);
  await request(disabled).post('/v1/auth/demo-access').send({role:'institution'}).expect(patch.DEMO_READ_ONLY?403:404);
  await request(disabled).get('/v1/office/workspace').auth(institution.token,{type:'bearer'}).expect(401);
 }
 process.env.FAIRPASS_LOCAL='false';
 const notLocal=createApp(config,store,chain);t.after(()=>notLocal.locals.closeScoring());
 await request(notLocal).post('/v1/auth/demo-access').send({role:'institution'}).expect(404);
 process.env.FAIRPASS_LOCAL='true';
 const wrongRpc=createApp(config,store,{...chain,ready:async()=>{throw Error('RPC chain mismatch');}});t.after(()=>wrongRpc.locals.closeScoring());
 await request(wrongRpc).post('/v1/auth/demo-access').send({role:'institution'}).expect(503);
 await request(app).post('/v1/auth/institution/logout').auth(institution.token,{type:'bearer'}).expect(204);
 await request(app).get('/v1/office/workspace').auth(institution.token,{type:'bearer'}).expect(401);
});
