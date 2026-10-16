import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Hex } from 'viem';
import { allocatePreview, validateRulebook, rulebookCommitment, evaluateRulebook, type AdmissionRulebook } from '../shared/domain.js';
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
      if (!session || session.role === 'institution') fail(401, 'unauthorized');
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
  const institutionId = config.INSTITUTION_ID ?? 'fairpass-demo';
  const metadata=(d:import('./store.js').ProgramDoc|null)=>d?{institutionName:config.INSTITUTION_NAME??'Example University',programName:d.rulebook?.programName??'Registered program',faculty:d.rulebook?.faculty,rulebookId:d.rulebook?.id,degree:d.rulebook?.degree}:null;
  const office = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await store.sessions.findOne({ _id: tokenHash(bearer(req)), role: 'institution', institutionId, expiresAt: { $gt: new Date() } });
      if (!session) fail(401, 'institution_login_required');
      res.locals.institutionId = session.institutionId;
      res.setHeader('Cache-Control', 'no-store'); next();
    } catch (e) { next(e); }
  };
  const issuerSession = (req: Request, res: Response, next: NextFunction) =>
    safeEqual(bearer(req), config.ISSUER_API_TOKEN) ? next() : office(req, res, next);
  const requireProgramScope = async (res: Response, programId: Hex | null) => {
    if (!res.locals.institutionId) return; // Machine credential remains server/CLI only.
    const program = programId && await store.programs.findOne({ _id: programId });
    if (!program || program.institutionId !== res.locals.institutionId) fail(403, 'program_outside_institution');
  };
  app.use('/v1/office', (_req, res, next) => { res.setHeader('Cache-Control','no-store'); next(); });
  app.post('/v1/admin/operators', operator(config.ADMIN_API_TOKEN), async (req, res) => {
    const input = z.object({ operatorId:id, name:z.string().min(1).max(200), institutionId:id, password:z.string().min(12).max(128) }).strict().parse(req.body);
    if (input.institutionId !== institutionId) fail(403, 'institution_not_configured');
    await store.operators.insertOne({_id:input.operatorId,name:input.name,institutionId,passwordHash:await passwordHash(input.password)});
    res.status(201).json({operatorId:input.operatorId,institutionId});
  });
  app.post('/v1/auth/institution/login', rateLimit({windowMs:15*60000,limit:15}), async(req,res)=>{
    const input=z.object({operatorId:id,password:z.string().min(1).max(128)}).strict().parse(req.body);
    const record=await store.operators.findOne({_id:input.operatorId,institutionId});
    const valid=record ? await passwordMatches(input.password,record.passwordHash) : (await passwordHash(input.password),false);
    if(!valid) fail(401,'invalid_credentials');
    const token=randomId(), expiresAt=new Date(Date.now()+8*60*60000);
    await store.sessions.insertOne({_id:tokenHash(token),studentId:input.operatorId,role:'institution',institutionId,expiresAt});
    res.setHeader('Cache-Control','no-store'); res.json({token,expiresAt,institutionId,name:record!.name});
  });
  app.post('/v1/auth/institution/logout',office,async(req,res)=>{
    await store.sessions.deleteOne({_id:tokenHash(bearer(req))}); res.sendStatus(204);
  });
  const componentSchema=z.object({
    scoreId:id,label:z.string().min(1).max(100),source:z.enum(['demo-exam-provider','demo-school-record']),
    sourceComponentId:z.string().min(1).max(100),maximum:z.number().positive().max(10000),
    transformation:z.literal('normalize-to-100'),weightPercent:z.number().positive().max(100),minimumPercent:z.number().min(0).max(100).nullable()
  }).strict();
  const ruleSchema=z.object({
    id,programId:id,institutionId:id,programName:z.string().min(1).max(200),degree:z.string().min(1).max(200).refine(s=>!!s.trim()).optional(),faculty:z.string().min(1).max(200),
    academicYear:z.number().int().min(2020).max(2100),round:z.string().min(1).max(80),capacity:z.number().int().min(1).max(10000),version:z.number().int().positive(),
    method:z.literal('normalized-weighted-sum'),components:z.array(componentSchema).min(1).max(20),
    requiredSubjects:z.array(id).max(20),qualifications:z.array(z.object({field:z.literal('curriculum'),equals:z.enum(['Science–Mathematics','Arts–Languages'])}).strict()).max(2),
    status:z.enum(['draft','preview']),createdAt:z.iso.datetime(),sealedAt:z.iso.datetime().nullable(),commitment:hex.nullable(),chainReference:z.null(),publication:z.null()
  }).strict();
  app.get('/v1/office/workspace',office,async(_req,res)=>{
    const drafts=await store.drafts.find({institutionId:res.locals.institutionId}).limit(100).toArray();
    res.json({institutionId:res.locals.institutionId,drafts});
  });
  app.get('/v1/office/students',office,async(_req,res)=>{
    // This deployment has one institution. Never return authentication fields.
    const students=await store.students.find({}).limit(200).toArray();
    res.json(students.map(s=>({id:s._id,name:s.name})));
  });
  app.post('/v1/office/rulebooks/drafts',office,async(req,res)=>{
    const input=z.object({rule:ruleSchema,expectedRevision:z.number().int().nonnegative()}).strict().parse(req.body);
    if(input.rule.institutionId!==res.locals.institutionId) fail(403,'program_outside_institution');
    const key=`${res.locals.institutionId}:${input.rule.id}`;
    const published=await store.programs.findOne({'rulebook.id':input.rule.id,institutionId:res.locals.institutionId});
    if(published) fail(409,'published_rulebook_immutable');
    const current=await store.drafts.findOne({_id:key});
    if((current?.revision??0)!==input.expectedRevision) fail(409,'draft_revision_conflict');
    const revision=input.expectedRevision+1;
    const result=await store.drafts.updateOne({_id:key,...(current?{revision:input.expectedRevision}:{revision:{$exists:false}})},
      {$set:{institutionId:res.locals.institutionId,rule:input.rule,revision,updatedAt:new Date()}},{upsert:!current});
    if(current && !result.modifiedCount) fail(409,'draft_revision_conflict');
    res.json({rule:input.rule,revision});
  });
  app.get('/v1/office/simulations/:id',office,async(req,res)=>{
    const run=await store.runs.findOne({_id:id.parse(req.params.id),institutionId:res.locals.institutionId});
    if(!run) fail(404,'run_not_found');
    const programs=await store.programs.find({institutionId:res.locals.institutionId,'rulebook.id':{$in:run.rulebooks.map(r=>r.id)}}).toArray();
    const programIds=run.programIds??run.rulebooks.map(r=>programs.find(p=>p.rulebook?.id===r.id)?._id);
    if(programIds.some(p=>!p)) fail(409,'run_program_unavailable');
    res.json({runId:run._id,programIds,applicants:run.applicants});
  });
  app.get('/v1/office/simulations',office,async(_req,res)=>{
    const runs=await store.runs.find({institutionId:res.locals.institutionId}).limit(30).toArray();
    res.json(runs.map(r=>({runId:r._id,createdAt:r.createdAt,completedAt:r.completedAt??null,assignments:r.assignments})));
  });
  app.post('/v1/office/rulebooks/publish',office,async(req,res)=>{
    const rule:AdmissionRulebook=ruleSchema.parse(req.body);
    if(rule.institutionId !== res.locals.institutionId) fail(403,'program_outside_institution');
    const errors=validateRulebook(rule); if(errors.length) fail(400,'invalid_rulebook');
    // Version is deliberately excluded: a new version cannot mint another seat pool.
    const programId=rulesCommitment({scheme:'fairpass-intake-v1',institutionId:rule.institutionId,programId:rule.programId,academicYear:rule.academicYear,round:rule.round});
    const rulesHash=await rulebookCommitment(rule) as Hex;
    const output=await workflow(async()=>{
      let doc=await store.programs.findOne({_id:programId});
      if(doc && doc.rulesHash !== rulesHash) fail(409,'intake_already_published');
      if(!doc) {
        await store.programs.insertOne({_id:programId,institutionId,rulebook:rule,rules:rule,rulesHash,year:rule.academicYear,capacity:rule.capacity});
        doc=(await store.programs.findOne({_id:programId}))!;
      }
      const p=await chain.read('programs',[programId]);
      if(p[0] === '0x0000000000000000000000000000000000000000') {
        const registration=await chain.write('issuer','registerProgram',[programId,rule.academicYear,rule.capacity,rulesHash]);
        await store.programs.updateOne({_id:programId},{$set:{registration}});
      } else if(p[6] !== rulesHash || p[0].toLowerCase() !== chain.issuer.toLowerCase() || p[1] !== rule.academicYear || p[2] !== rule.capacity) fail(409,'onchain_program_conflict');
      if((await chain.read('programs',[programId]))[7] === 0n) {
        const lock=await chain.write('issuer','lockRules',[programId]);
        await store.programs.updateOne({_id:programId},{$set:{lock}});
      }
      const current=(await store.programs.findOne({_id:programId}))!;
      const locked=await chain.read('programs',[programId]);
      if(locked[7] === 0n || locked[6] !== rulesHash) fail(409,'rules_not_locked');
      const publishedRulebook:AdmissionRulebook={...rule,status:'published',commitment:rulesHash,sealedAt:new Date(Number(locked[7])*1000).toISOString(),chainReference:current.lock ?? null,publication:{issuerAuthenticated:true,inclusionVerified:true,commitmentMatches:true,publishedAt:new Date(Number(locked[7])*1000).toISOString()}};
      await store.programs.updateOne({_id:programId},{$set:{rulebook:publishedRulebook,rules:publishedRulebook}});
      return {programId,rulesHash,rulebook:publishedRulebook,registration:current.registration ?? null,lock:current.lock ?? null,...chain.info};
    });
    res.status(201).json(output);
  });
  app.get('/v1/office/results',office,async(_req,res)=>{
    const programs=await store.programs.find({institutionId:res.locals.institutionId}).toArray();
    const docs=await store.results.find({'report.preferences':{$in:programs.map(p=>p._id)}}).limit(500).toArray();
    res.json(await Promise.all(docs.map(async d=>({
      resultId:d.resultId,studentId:d.studentId,outcome:d.report.outcome,programId:d.report.programId,
      confirmationRequestedAt:d.confirmationRequestedAt ?? null,
      credential:await chain.read('credential',[d.credentialId]).then(c=>c[1]?{credentialId:d.credentialId,status:statuses[c[1]],lifecycle:c[1]===2?'enrolled':statuses[c[1]]}:null),
      publication:d.publication ?? null,issuance:d.issuance ?? null
    }))));
  });
  const scoreSchema=z.object({id,subject:z.string().max(100),label:z.string().max(100),score:z.number().nonnegative(),maximum:z.number().positive(),provenance:z.literal('simulated-exam-provider')}).strict().refine(s=>s.score<=s.maximum,'Score exceeds maximum');
  app.post('/v1/office/simulations',office,async(req,res)=>{
    const input=z.object({runId:id,programIds:z.array(nonzero).min(1).max(10),applicants:z.array(z.object({
      id,scores:z.array(scoreSchema).min(1).max(20),preferences:z.array(id).min(1).max(10),
      qualifications:z.record(z.string().max(40),z.string().max(100))
    }).strict()).min(1).max(100)}).strict().parse(req.body);
    const output=await workflow(async()=>{
      const inputHash=rulesCommitment(input);
      let run=await store.runs.findOne({_id:input.runId});
      if(run && (run.inputHash !== inputHash || run.institutionId !== institutionId)) fail(409,'run_payload_conflict');
      const programs=await Promise.all(input.programIds.map(async key=>{
        await requireProgramScope(res,key);
        const p=(await store.programs.findOne({_id:key}))!;
        const live=await chain.read('programs',[key]);
        if(!p.rulebook || !live[7] || live[6] !== await rulebookCommitment(p.rulebook)) fail(409,'rules_not_locked');
        return p;
      }));
      if(new Set(input.programIds).size !== input.programIds.length) fail(400,'duplicate_program');
      const rules=programs.map(p=>p.rulebook!);
      if(rules.some(r=>r.academicYear!==rules[0].academicYear || r.round!==rules[0].round)) fail(400,'mixed_cycles');
      for(const applicant of input.applicants) if(!await store.students.findOne({_id:applicant.id})) fail(404,'student_not_found');
      for(const applicant of input.applicants) for(const logical of applicant.preferences) {
        const rule=rules.find(r=>r.programId===logical);
        if(!rule || evaluateRulebook(rule,applicant.scores,applicant.qualifications).status !== 'calculated') fail(400,'invalid_applicant_scores_or_preferences');
      }
      let assignments:Record<string,string|null>;
      try { assignments=allocatePreview(rules,input.applicants); } catch { fail(400,'invalid_cohort'); }
      if(!run) {
        if(programs.some(p=>p.simulationRunId&&p.simulationRunId!==input.runId)) fail(409,'intake_already_processed');
        run={_id:input.runId,inputHash,institutionId,programIds:input.programIds,rulebooks:rules,applicants:input.applicants,assignments,createdAt:new Date()};
        await store.runs.insertOne(run);
      }
      // Claim all intakes before any result broadcast. Retry resumes the same run.
      for(const p of programs) {
        const claim=await store.programs.updateOne({_id:p._id,$or:[{simulationRunId:{$exists:false}},{simulationRunId:input.runId}]},{$set:{simulationRunId:input.runId}});
        if(!claim.matchedCount) fail(409,'intake_already_processed');
      }
      for(const applicant of run.applicants) {
        const eventId=`simulation:${run._id}:${applicant.id}`;
        let doc=await store.results.findOne({_id:eventId});
        if(!doc) {
          const selected=run.assignments[applicant.id];
          const report:ResultDoc['report']={
            academicYear:rules[0].academicYear,round:rules[0].round,outcome:selected?'admitted':'not_admitted',
            programId:selected?programs.find(p=>p.rulebook!.programId===selected)!._id:null,
            scores:Object.fromEntries(applicant.scores.map(s=>[s.id,s.score])),
            preferences:applicant.preferences.map(logical=>programs.find(p=>p.rulebook!.programId===logical)!._id),
            trace:applicant.preferences.map(logical=>({programId:logical,...evaluateRulebook(rules.find(r=>r.programId===logical)!,applicant.scores,applicant.qualifications)})),
            source:'fictional-simulator',rulebooks:run.rulebooks,scoreRecords:applicant.scores,qualifications:applicant.qualifications,runId:run._id
          };
          const salt=randomId();
          doc={_id:eventId,studentId:applicant.id,resultId:randomId(),credentialId:randomId(),subject:await store.subject(applicant.id,rules[0].academicYear,randomId()),salt,report,commitment:commitment(report,salt),inputHash};
          await store.results.insertOne(doc);
        }
        await publish(doc);
      }
      const completedAt=run.completedAt ?? new Date();
      await store.runs.updateOne({_id:run._id},{$set:{completedAt}});
      return {runId:run._id,source:'fictional-simulator',assignments:run.assignments,completedAt,...chain.info};
    });
    res.status(201).json(output);
  });

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
    const records = await Promise.all(docs.map(async d => ({ resultId: d.resultId, report: d.report, program:metadata(d.report.programId?await store.programs.findOne({_id:d.report.programId}):null),
      commitment: d.commitment, confirmationRequestedAt: d.confirmationRequestedAt ?? null,
      publication:d.publication ?? null, issuance:d.issuance ?? null,
      credential: await chain.read('credential', [d.credentialId]).then(c => c[1] ? { credentialId: d.credentialId, programId: c[0], status: statuses[c[1]], lifecycle:c[1] === 2 ? 'enrolled' : statuses[c[1]] } : null) })));
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
  app.post('/v1/issuer/results/:id/issue', issuerSession, async (req, res) => {
    const resultId = nonzero.parse(req.params.id);
    const output = await workflow(async () => {
      const doc = await store.results.findOne({ resultId });
      if (!doc) fail(404, 'result_not_found');
      await requireProgramScope(res, doc.report.programId);
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
      return { credentialId: doc.credentialId, status: statuses[current[1]], programId: current[0], issuance: (await store.results.findOne({_id:doc._id}))?.issuance ?? null, ...chain.info };
    });
    res.json(output);
  });
  app.post('/v1/issuer/credentials/:id/status', issuerSession, async (req, res) => {
    const input = z.object({ status: z.enum(['enrolled', 'withdrawn', 'revoked']), reasonCommitment: nonzero }).strict().parse(req.body);
    const credentialId = nonzero.parse(req.params.id);
    const target = { enrolled: 2, withdrawn: 3, revoked: 4 }[input.status];
    const result = await workflow(async () => {
      const current = await chain.read('credential', [credentialId]);
      await requireProgramScope(res, current[0]);
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
      return { metadata:metadata(d), programId: d._id, issuer: p[0], academicYear: p[1], capacity: p[2], active: p[3], historicalIssued: p[4], issuanceAllowance: p[5],
        rulesHash: p[6], lockedAt: String(p[7]), rules: d.rules, rulebook:d.rulebook ?? null, registration:d.registration ?? null, lock:d.lock ?? null, rulesMatch: (d.rulebook ? await rulebookCommitment(d.rulebook) : rulesCommitment(d.rules)) === p[6], ...chain.info };
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
        metadata:metadata(await store.programs.findOne({_id:c[0]})), programId: c[0], issuer: c[2], academicYear: c[3], issuerCurrentlyAuthorized: authorized,
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
