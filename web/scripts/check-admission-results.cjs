// Focused regressions for scoring, verification claims, and unsuccessful-applicant token isolation.
// Uses the project's existing TypeScript and React dependencies; no additional test runner.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const webRequire = createRequire(path.resolve(__dirname, '../package.json'));
const ts = webRequire('typescript');

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const { demoData, nonAdmittedWallet } = require('../src/data/demo.ts');
const { calculateProgramScore, resultCheckState, walletCanShowAdmissionToken } = require('../src/domain/admissionResults.ts');
const report = nonAdmittedWallet.admission.result;
assert.deepEqual(report.rankedPrograms.map(choice => calculateProgramScore(nonAdmittedWallet.scores, choice.criteria).total), [60.3, 59.8, 61.15]);

const criteria = report.rankedPrograms[0].criteria;
assert.equal(calculateProgramScore(nonAdmittedWallet.scores.slice(1), criteria).status, 'unavailable');
assert.equal(calculateProgramScore(nonAdmittedWallet.scores, [...criteria, criteria[0]]).status, 'unavailable');
assert.equal(calculateProgramScore(nonAdmittedWallet.scores, [{ scoreId: 'tgat', weightPercent: 99 }]).status, 'unavailable');
assert.equal(calculateProgramScore([{ ...nonAdmittedWallet.scores[0], score: NaN }], [{ scoreId: 'tgat', weightPercent: 100 }]).status, 'unavailable');
assert.equal(calculateProgramScore([{ ...nonAdmittedWallet.scores[0], score: 101 }], [{ scoreId: 'tgat', weightPercent: 100 }]).status, 'unavailable');
assert.equal(calculateProgramScore([{ ...nonAdmittedWallet.scores[0], score: 123, maximum: 200 }], [{ scoreId: 'tgat', weightPercent: 100 }]).total, 61.5);

const claimed = { status: 'verified', explanation: 'Test claim', evidence: null };
assert.equal(resultCheckState('score_authenticity', claimed), 'not_verified');
const scoreProof = { source: 'live', kind: 'score_authenticity', checkedAt: '2026-10-15T12:00:00Z', reference: 'test-only:signature-check', issuerAuthenticated: true, signatureValid: true };
assert.equal(resultCheckState('score_authenticity', { ...claimed, evidence: { ...scoreProof, source: 'fixture' } }), 'not_verified');
assert.equal(resultCheckState('score_authenticity', { ...claimed, evidence: { ...scoreProof, signatureValid: false } }), 'not_verified');
assert.equal(resultCheckState('result_integrity', { ...claimed, evidence: scoreProof }), 'not_verified');
assert.equal(resultCheckState('score_authenticity', { ...claimed, evidence: scoreProof }), 'verified');
const allocationProof = { source: 'live', kind: 'allocation_correctness', checkedAt: '2026-10-15T12:00:00Z', reference: 'test-only:recomputation', completeAuthenticatedInputs: false, publishedAlgorithmVerified: true, recomputedOutcomeMatches: true };
assert.equal(resultCheckState('allocation_correctness', { ...claimed, evidence: allocationProof }), 'not_verified');
assert.equal(resultCheckState('result_integrity', { ...claimed, evidence: { source: 'live', kind: 'result_integrity', checkedAt: '2026-10-15T12:00:00Z', reference: 'test-only:commitment', chainInclusionVerified: false, privateRecordMatchesCommitment: true } }), 'not_verified');
for (const [kind, check] of Object.entries(report.verification)) assert.notEqual(resultCheckState(kind, check), 'verified');

assert.equal(report.attestation.kind, 'admission_result');
assert.equal(report.attestation.grantsAdmissionRight, false);
assert.equal(walletCanShowAdmissionToken(nonAdmittedWallet), false);
assert.deepEqual(nonAdmittedWallet.credentials, []);
assert.deepEqual(Object.keys(report.publicCommitment).sort(), ['chainReference', 'id', 'scheme', 'value']);
assert.equal(demoData.verificationCredentials.some(credential => credential.id === report.attestation.id), false);

const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
global.window = { location: { href: 'http://localhost:5173/student/wallet?demo=not-admitted', search: '?demo=not-admitted', origin: 'http://localhost:5173' } };
const { WalletPage } = require('../src/pages/WalletPage.tsx');
const pollutedWallet = { ...nonAdmittedWallet, credentials: [demoData.admissionCredential] };
const html = renderToStaticMarkup(React.createElement(WalletPage, { data: { ...demoData, demoWallets: [demoData.wallet, pollutedWallet] } }));
assert.ok(html.includes('Your result. Clearly explained.'));
assert.ok(html.includes('Understand my result'));
assert.ok(!html.includes('class="token-card'));
assert.ok(!html.includes(demoData.admissionCredential.id));
assert.ok(!html.includes('>Verified</span>'));
for (const score of ['60.30', '59.80', '61.15']) assert.ok(html.includes(score));
global.window.location.search = '';
const admitted = renderToStaticMarkup(React.createElement(WalletPage, { data: demoData }));
assert.ok(admitted.includes('Your admission. Now a token.'));
assert.ok(admitted.includes('class="token-card'));
assert.ok(admitted.includes(demoData.admissionCredential.id));
assert.ok(!admitted.includes('Your result. Clearly explained.'));
delete global.window;
console.log('Admission result checks passed: scoring, evidence gates, privacy projection, non-admitted token isolation, and admitted rendering.');
