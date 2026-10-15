import 'dotenv/config';
import { keccak256, stringToHex } from 'viem';
import { simulate } from '../src/simulator.js';
const base = process.env.API_URL ?? 'http://127.0.0.1:3001';
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD (12+ characters); use fictional accounts only');
const api = async (path: string, token: string | undefined, body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<any>;
};
// New run IDs keep this demo repeatable without resetting the database/chain.
const run = Date.now().toString();
const programId = keccak256(stringToHex(`fictional-engineering-${run}`));
const rules = { name: 'Fictional Engineering', weights: { math: 6000, english: 4000 }, minimumScore: 50, tieBreak: 'opaque-applicant-id-ascending', fictional: true };
await api('/v1/issuer/programs', process.env.ISSUER_API_TOKEN, { programId, academicYear: 2027, capacity: 1, rules });
const applicants = [
  { id: `pim-${run}`, scores: { math: 95, english: 90 }, preferences: [programId] },
  { id: `narin-${run}`, scores: { math: 60, english: 65 }, preferences: [programId] },
];
for (const a of applicants) await api('/v1/admin/students', process.env.ADMIN_API_TOKEN, { studentId: a.id, name: a.id.startsWith('pim') ? 'Pim (fictional)' : 'Narin (fictional)', password });
// Matching happens strictly AFTER registration/lock transactions have mined.
const results = simulate([{ id: programId, capacity: 1, ...rules }], applicants);
for (const result of results) {
  const applicant = applicants.find(a => a.id === result.studentId)!;
  const attestation = await api('/v1/integration/results', process.env.INTEGRATION_API_TOKEN, { eventId: `${result.studentId}-round3`, ...result,
    scores: applicant.scores, preferences: applicant.preferences, academicYear: 2027, round: 'fictional-round-3', source: 'fictional-simulator' });
  const login = await api('/v1/auth/login', undefined, { studentId: applicant.id, password });
  if (result.outcome === 'admitted') {
    await api(`/v1/me/results/${attestation.resultId}/confirm`, login.token, {});
    const issued = await api(`/v1/issuer/results/${attestation.resultId}/issue`, process.env.ISSUER_API_TOKEN, {});
    console.log('Public credential:', await api(`/v1/public/verify/${issued.credentialId}`, undefined));
  }
  const proof = await api(`/v1/me/results/${attestation.resultId}/proof`, login.token);
  console.log({ fictional: true, studentId: applicant.id, outcome: result.outcome, resultId: attestation.resultId, verification: proof.verification });
}
console.log('Program:', programId);
