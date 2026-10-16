import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { SignJWT, decodeJwt } from 'jose';
import { createHash } from 'node:crypto';
import { createSessionTokens } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { passwordHash } from '../src/crypto.js';
import type { Config } from '../src/config.js';
import type { Store, Session } from '../src/store.js';
import type { ChainGateway } from '../src/chain.js';
const config = { ADMIN_API_TOKEN: 'admin'.repeat(10), INTEGRATION_API_TOKEN: 'integration'.repeat(4), ISSUER_API_TOKEN: 'issuer'.repeat(7), CORS_ORIGIN: 'http://localhost:5173', SESSION_JWT_SECRET: 'test-secret'.repeat(8), SESSION_TTL_SECONDS: 604800 } as Config;
test('JWT signature, expiry, audience, role, privacy and restart-stable keys', async () => {
  const tokens = createSessionTokens(config);
  const { token, expiresAt } = await tokens.issue('student');
  assert.equal(await createSessionTokens(config).valid(token, 'student'), true);
  assert.equal(await tokens.valid(token, 'institution'), false);
  assert.equal(await tokens.valid(token.slice(0, -5) + 'xxxxx', 'student'), false);
  assert.equal(await tokens.valid('opaque-old-session', 'student'), false);
  assert.equal(await createSessionTokens({ ...config, SESSION_JWT_SECRET: 'rotated'.repeat(10) }).valid(token, 'student'), false);
  const claims = decodeJwt(token);
  assert.equal(claims.exp! - claims.iat!, 604800);
  assert.equal(expiresAt.getTime(), claims.exp! * 1000);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'role', 'sub']);
  const key = createHash('sha256').update(config.SESSION_JWT_SECRET!).digest();
  const signed = (exp: number, aud = 'fairpass-web', alg = 'HS256') => new SignJWT({ role: 'student' }).setProtectedHeader({ alg, typ: 'JWT' }).setIssuer('fairpass-api').setAudience(aud).setSubject('opaque-id').setIssuedAt().setExpirationTime(exp).sign(key);
  assert.equal(await tokens.valid(await signed(Math.floor(Date.now() / 1000) - 10), 'student'), false);
  assert.equal(await tokens.valid(await signed(Math.floor(Date.now() / 1000) + 100, 'other-app'), 'student'), false);
  assert.equal(await tokens.valid(await signed(Math.floor(Date.now() / 1000) + 100, 'fairpass-web', 'HS384'), 'student'), false);
});
test('login survives API recreation, isolates roles and logout revokes JWTs', async () => {
  const sessions = new Map<string, Session>();
  const hashed = await passwordHash('fictional-test-password');
  const store = {
    sessions: {
      insertOne: async (s: Session) => { sessions.set(s._id, s); },
      findOne: async (q: Record<string, any>) => { const s = sessions.get(q._id); return s && s.expiresAt > q.expiresAt.$gt && (!q.role || q.role === s.role) && (!q.institutionId || q.institutionId === s.institutionId) ? s : null; },
      deleteOne: async (q: { _id: string }) => { sessions.delete(q._id); },
    },
    students: { findOne: async () => ({ _id: 'student-test', name: 'Fictional student', passwordHash: hashed }) },
    operators: { findOne: async () => ({ _id: 'operator-test', name: 'Fictional operator', institutionId: 'fairpass-demo', passwordHash: hashed }) },
    results: { find: () => ({ toArray: async () => [] }) },
    drafts: { find: () => ({ limit: () => ({ toArray: async () => [] }) }) },
  } as unknown as Store;
  const app = createApp(config, store, { info: {} } as ChainGateway);
  const student = (await request(app).post('/v1/auth/login').send({ studentId: 'student-test', password: 'fictional-test-password' }).expect(200)).body;
  const university = (await request(app).post('/v1/auth/institution/login').send({ operatorId: 'operator-test', password: 'fictional-test-password' }).expect(200)).body;
  assert.equal(student.token.split('.').length, 3);
  assert.ok(Date.parse(student.expiresAt) - Date.now() > 6 * 86400000);
  const restarted = createApp(config, store, { info: {} } as ChainGateway);
  await request(restarted).get('/v1/me/wallet').auth(student.token, { type: 'bearer' }).expect(200);
  await request(restarted).get('/v1/office/workspace').auth(university.token, { type: 'bearer' }).expect(200);
  await request(app).get('/v1/office/workspace').auth(student.token, { type: 'bearer' }).expect(401);
  await request(app).get('/v1/me/wallet').auth(university.token, { type: 'bearer' }).expect(401);
  await request(app).post('/v1/auth/logout').auth(student.token, { type: 'bearer' }).expect(204);
  await request(app).get('/v1/me/wallet').auth(student.token, { type: 'bearer' }).expect(401);
  await request(app).post('/v1/auth/institution/logout').auth(university.token, { type: 'bearer' }).expect(204);
  await request(app).get('/v1/office/workspace').auth(university.token, { type: 'bearer' }).expect(401);
  assert.equal(sessions.size, 0);
});
