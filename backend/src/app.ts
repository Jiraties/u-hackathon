import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Hex } from 'viem';
import type { Config } from './config.js';
import type { Store, ResultDoc } from './store.js';
import type { ChainGateway } from './chain.js';
import { commitment, randomId, rulesCommitment, passwordHash, passwordMatches, safeEqual, tokenHash } from './crypto.js';
const ZERO = `0x${'0'.repeat(64)}` as Hex;
const hex = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(s => s.toLowerCase() as Hex);
const nonzero = hex.refine(v => v !== ZERO);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const year = z.number().int().min(2000).max(3000);
const intake = z.object({
  eventId: id, studentId: id, academicYear: year, round: z.string().min(1).max(80),
  outcome: z.enum(['admitted', 'not_admitted']), programId: nonzero.nullable(),
  scores: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), z.number().min(0).max(100)),
  preferences: z.array(nonzero).min(1).max(10),
  trace: z.array(z.object({ programId: nonzero, eligible: z.boolean(), calculatedScore: z.number().min(0).max(100), explanation: z.string().max(500) })).max(10),
  source: z.enum(['fictional-simulator', 'external-adapter']),
}).strict().refine(v => (v.outcome === 'admitted') === (v.programId !== null), 'Admitted requires a program; not_admitted requires null')
  .refine(v => new Set(v.preferences).size === v.preferences.length, 'Duplicate preferences')
  .refine(v => !v.programId || v.preferences.includes(v.programId), 'Offered program must be a preference');
class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
function fail(status: number, code: string): never { throw new HttpError(status, code); }
const bearer = (req: Request) => req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] ?? '';
const statuses = ['not_found', 'valid', 'valid', 'withdrawn', 'revoked'] as const;
export function createApp(config: Config, store: Store, chain: ChainGateway) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet(), cors({ origin: config.CORS_ORIGIN }), express.json({ limit: '128kb' }));
  app.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/v1/me', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const operator = (token: string) => (req: Request, _res: Response, next: NextFunction) => {
    if (!safeEqual(bearer(req), token)) return next(new HttpError(401, 'unauthorized'));
    next();
  };
  const student = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await store.sessions.findOne({ _id: tokenHash(bearer(req)), expiresAt: { $gt: new Date() } });
      if (!session) fail(401, 'unauthorized');
      res.locals.studentId = session.studentId; next();
    } catch (e) { next(e); }
  };
  const resultForStudent = async (req: Request, res: Response) => {
    const doc = await store.results.findOne({ resultId: nonzero.parse(req.params.id), studentId: res.locals.studentId });
    return doc ?? fail(404, 'result_not_found');
  };
  // Serializes multi-step workflows. Deterministic IDs + chain reads recover after a crash.
  let tail: Promise<unknown> = Promise.resolve();
  const workflow = <T>(fn: () => Promise<T>): Promise<T> => {
    const current = tail.then(fn); tail = current.catch(() => undefined); return current;
  };
  async function publish(doc: ResultDoc) {
    if (commitment(doc.report, doc.salt) !== doc.commitment) fail(409, 'private_record_integrity_failure');
    const existing = await chain.read('resultCommitment', [doc.resultId]);
    if (existing[1] !== 0n) {
      if (existing[0] !== doc.commitment) fail(409, 'onchain_commitment_conflict');
      return;
    }
    const publication = await chain.write('authority', 'recordResult', [doc.resultId, doc.commitment, doc.subject, doc.report.programId ?? ZERO, doc.report.academicYear, doc.report.outcome === 'admitted']);
    await store.results.updateOne({ _id: doc._id }, { $set: { publication } });
  }
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => { await store.ping(); await chain.ready(); res.json({ status: 'ready', ...chain.info }); });
  app.post('/v1/admin/students', operator(config.ADMIN_API_TOKEN), async (req, res) => {
    const input = z.object({ studentId: id, name: z.string().min(1).max(200), password: z.string().min(12).max(128) }).strict().parse(req.body);
    await store.students.insertOne({ _id: input.studentId, name: input.name, passwordHash: await passwordHash(input.password) });
    res.status(201).json({ studentId: input.studentId });
  });
  app.post('/v1/auth/login', rateLimit({ windowMs: 15 * 60000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const input = z.object({ studentId: id, password: z.string().min(1).max(128) }).strict().parse(req.body);
    const record = await store.students.findOne({ _id: input.studentId });
    // Equalize expensive password work for unknown accounts.
    const valid = record ? await passwordMatches(input.password, record.passwordHash) : (await passwordHash(input.password), false);
    if (!valid) fail(401, 'invalid_credentials');
    const token = randomId(); const expiresAt = new Date(Date.now() + 8 * 60 * 60000);
    await store.sessions.insertOne({ _id: tokenHash(token), studentId: input.studentId, expiresAt });
    res.setHeader('Cache-Control', 'no-store'); res.json({ token, expiresAt });
  });
  app.post('/v1/auth/logout', student, async (req, res) => {
    await store.sessions.deleteOne({ _id: tokenHash(bearer(req)) }); res.sendStatus(204);
  });
  app.post('/v1/issuer/programs', operator(config.ISSUER_API_TOKEN), async (req, res) => {
    const input = z.object({ programId: nonzero, academicYear: year, capacity: z.number().int().min(1).max(100000),
      rules: z.object({ name: z.string().min(1).max(200), weights: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), z.number().int().min(0).max(10000)), minimumScore: z.number().min(0).max(100), tieBreak: z.literal('opaque-applicant-id-ascending'), fictional: z.literal(true) }).strict()
    }).strict().refine(v => Object.values(v.rules.weights).reduce((a, b) => a + b, 0) === 10000, 'Weights must sum to 10000 basis points').parse(req.body);
    const rules = { ...input.rules, academicYear: input.academicYear, capacity: input.capacity, version: 'fairpass-simulator-v1' };
    const rulesHash = rulesCommitment(rules);
    await workflow(async () => {
      const existing = await store.programs.findOne({ _id: input.programId });
      if (existing && existing.rulesHash !== rulesHash) fail(409, 'program_payload_conflict');
      if (!existing) await store.programs.insertOne({ _id: input.programId, year: input.academicYear, capacity: input.capacity, rules, rulesHash });
      const p = await chain.read('programs', [input.programId]);
      if (p[0] === '0x0000000000000000000000000000000000000000') {
        const registration = await chain.write('issuer', 'registerProgram', [input.programId, input.academicYear, input.capacity, rulesHash]);
        await store.programs.updateOne({ _id: input.programId }, { $set: { registration } });
      } else if (p[6] !== rulesHash || p[0].toLowerCase() !== chain.issuer.toLowerCase() || p[2] !== input.capacity) fail(409, 'onchain_program_conflict');
      const current = await chain.read('programs', [input.programId]);
      if (current[7] === 0n) {
        const lock = await chain.write('issuer', 'lockRules', [input.programId]);
        await store.programs.updateOne({ _id: input.programId }, { $set: { lock } });
      }
    });
    res.status(201).json({ programId: input.programId, rules, rulesHash, ...chain.info });
  });
  app.post('/v1/integration/results', operator(config.INTEGRATION_API_TOKEN), async (req, res) => {
    const input = intake.parse(req.body);
    const doc = await workflow(async () => {
      const existing = await store.results.findOne({ _id: input.eventId });
      const inputHash = rulesCommitment(input);
      if (existing) {
        if (existing.inputHash !== inputHash) fail(409, 'event_payload_conflict');
        await publish(existing); return existing;
      }
      if (!await store.students.findOne({ _id: input.studentId })) fail(404, 'student_not_found');
      const ruleEvidence: Record<string, Hex> = {};
      for (const preference of input.preferences) {
        const p = await chain.read('programs', [preference]);
        if (p[7] === 0n || p[1] !== input.academicYear) fail(409, 'rules_not_locked');
        ruleEvidence[preference] = p[6];
      }
      const { eventId, studentId, ...report } = input;
      const salt = randomId();
      // Include the exact locked rules in the private result commitment.
      const enrichedReport = { ...report, ruleEvidence };
      const created: ResultDoc = { _id: eventId, studentId, resultId: randomId(), credentialId: randomId(),
        subject: await store.subject(studentId, input.academicYear, randomId()), salt, report: enrichedReport,
        commitment: commitment(enrichedReport, salt), inputHash };
      await store.results.insertOne(created); // Durable intent before broadcasting.
      await publish(created); return created;
    });
    res.status(201).json({ resultId: doc.resultId, commitment: doc.commitment, grantsAdmissionRight: false, ...chain.info });
  });
  app.get('/v1/me/wallet', student, async (_req, res) => {
    const profile = await store.students.findOne({ _id: res.locals.studentId });
    const docs = await store.results.find({ studentId: res.locals.studentId }).toArray();
    const records = await Promise.all(docs.map(async d => ({ resultId: d.resultId, report: d.report,
      commitment: d.commitment, confirmationRequestedAt: d.confirmationRequestedAt ?? null,
      credential: await chain.read('credential', [d.credentialId]).then(c => c[1] ? { credentialId: d.credentialId, programId: c[0], status: statuses[c[1]] } : null) })));
    res.json({ student: { id: profile!._id, name: profile!.name }, records, ...chain.info });
  });
  app.get('/v1/me/results/:id/proof', student, async (req, res) => {
    const doc = await resultForStudent(req, res);
    const [value, recordedAt] = await chain.read('resultCommitment', [doc.resultId]);
    res.json({ resultId: doc.resultId, report: doc.report, salt: doc.salt, scheme: 'fairpass-result-v1',
      verification: { resultIntegrity: recordedAt !== 0n && value === commitment(doc.report, doc.salt) ? 'verified' : 'not_verified',
        scoreAuthenticity: 'not_verified', allocationCorrectness: 'not_verified' },
      onchainCommitment: value, recordedAt: String(recordedAt), publication: doc.publication ?? null, ...chain.info });
  });
  app.post('/v1/me/results/:id/confirm', student, async (req, res) => {
    const doc = await resultForStudent(req, res);
    if (doc.report.outcome !== 'admitted') fail(409, 'not_admitted');
    await store.results.updateOne({ _id: doc._id }, { $set: { confirmationRequestedAt: doc.confirmationRequestedAt ?? new Date() } });
    // This records authenticated consent; institution issuance remains a separate operation.
    res.json({ resultId: doc.resultId, status: 'confirmation_requested' });
  });
  app.post('/v1/issuer/results/:id/issue', operator(config.ISSUER_API_TOKEN), async (req, res) => {
    const resultId = nonzero.parse(req.params.id);
    const output = await workflow(async () => {
      const doc = await store.results.findOne({ resultId });
      if (!doc) fail(404, 'result_not_found');
      if (!doc.confirmationRequestedAt || doc.report.outcome !== 'admitted') fail(409, 'confirmation_required');
      const program = await chain.read('programs', [doc.report.programId]);
      if (program[0].toLowerCase() !== chain.issuer.toLowerCase()) fail(403, 'wrong_issuer');
      await publish(doc);
      let current = await chain.read('credential', [doc.credentialId]);
      if (!current[1]) {
        // confirmResult may already have mined before a process crash. Read confirmation
        // via the explicit restricted operational view, never infer it from an error.
        const confirmed = await chain.read('isConfirmed', [doc.resultId]);
        if (!confirmed) {
          const confirmation = await chain.write('authority', 'confirmResult', [doc.resultId]);
          await store.results.updateOne({ _id: doc._id }, { $set: { confirmation } });
        }
        const issuance = await chain.write('issuer', 'issueRight', [doc.credentialId, doc.resultId]);
        await store.results.updateOne({ _id: doc._id }, { $set: { issuance } });
        current = await chain.read('credential', [doc.credentialId]);
      }
      return { credentialId: doc.credentialId, status: statuses[current[1]], programId: current[0], ...chain.info };
    });
    res.json(output);
  });
  app.post('/v1/issuer/credentials/:id/status', operator(config.ISSUER_API_TOKEN), async (req, res) => {
    const input = z.object({ status: z.enum(['enrolled', 'withdrawn', 'revoked']), reasonCommitment: nonzero }).strict().parse(req.body);
    const credentialId = nonzero.parse(req.params.id);
    const target = { enrolled: 2, withdrawn: 3, revoked: 4 }[input.status];
    const result = await workflow(async () => {
      const current = await chain.read('credential', [credentialId]);
      if (current[2].toLowerCase() !== chain.issuer.toLowerCase()) fail(403, 'wrong_issuer');
      return current[1] === target ? null : await chain.write('issuer', 'changeStatus', [credentialId, target, input.reasonCommitment]);
    });
    res.json({ status: input.status, transaction: result });
  });
  // Seat reallocation deliberately uses direct institution signing (documented CLI),
  // avoiding an HTTP retry accidentally authorizing the same allowance twice.
  app.get('/v1/public/programs', async (_req, res) => {
    const docs = await store.programs.find({}).limit(200).toArray();
    res.json(await Promise.all(docs.map(async d => {
      const p = await chain.read('programs', [d._id]);
      return { programId: d._id, issuer: p[0], academicYear: p[1], capacity: p[2], active: p[3], historicalIssued: p[4], issuanceAllowance: p[5],
        rulesHash: p[6], lockedAt: String(p[7]), rules: d.rules, rulesMatch: rulesCommitment(d.rules) === p[6], ...chain.info };
    })));
  });
  app.get('/v1/public/programs/:id/events', async (req, res) => {
    const query = z.object({ fromBlock: z.string().regex(/^\d+$/).optional(), toBlock: z.string().regex(/^\d+$/).optional() }).parse(req.query);
    if (query.fromBlock && query.toBlock && (BigInt(query.toBlock) < BigInt(query.fromBlock) || BigInt(query.toBlock) - BigInt(query.fromBlock) > 1999n)) fail(400, 'invalid_block_range');
    res.json(await chain.events(nonzero.parse(req.params.id), query.fromBlock ? BigInt(query.fromBlock) : undefined, query.toBlock ? BigInt(query.toBlock) : undefined));
  });
  app.get('/v1/public/verify/:id', async (req, res) => {
    const credentialId = nonzero.parse(req.params.id);
    try {
      const c = await chain.read('credential', [credentialId]);
      if (!c[1]) { res.status(404).json({ status: 'not_found', ...chain.info }); return; }
      const authorized = await chain.read('institutions', [c[2]]);
      res.json({ credentialId, type: 'admission_right', status: statuses[c[1]], lifecycle: c[1] === 2 ? 'enrolled' : statuses[c[1]],
        programId: c[0], issuer: c[2], academicYear: c[3], issuerCurrentlyAuthorized: authorized,
        source: 'chain', holderIdentityVerified: false, ...chain.info });
    } catch { res.status(503).json({ status: 'verification_unavailable' }); }
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'invalid_input', issues: error.issues.map(i => ({ path: i.path, message: i.message })) }); return; }
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.code }); return; }
    if ((error as { code?: number }).code === 11000) { res.status(409).json({ error: 'already_exists' }); return; }
    if ((error as { status?: number }).status === 413) { res.status(413).json({ error: 'payload_too_large' }); return; }
    if ((error as { status?: number }).status === 400) { res.status(400).json({ error: 'invalid_json' }); return; }
    // Do not log private request bodies, tokens, Mongo URIs or raw provider errors.
    console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
    res.status(503).json({ error: 'operation_unavailable', retry: 'Retry the same event ID/payload or credential operation; do not invent a new event ID.' });
  });
  return app;
}
