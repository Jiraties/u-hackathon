import type { ResultVerificationCheck, ResultVerificationKind, ScoreRecord } from "./models";

export type ProgramScoreCalculation =
  | { status: "calculated"; total: number; rawTotal: number; terms: { subject: string; label: string; score: number; maximum: number; weightPercent: number; contribution: number }[] }
  | { status: "unavailable"; reason: string };

/** Reproducible program-specific arithmetic, not score authentication or allocation verification. */
export const calculateProgramScore = (scores: readonly ScoreRecord[], criteria: readonly { scoreId: string; weightPercent: number }[]): ProgramScoreCalculation => {
  if (!criteria.length || new Set(criteria.map(term => term.scoreId)).size !== criteria.length
    || criteria.some(term => !Number.isFinite(term.weightPercent) || term.weightPercent <= 0 || term.weightPercent > 100)
    || Math.abs(criteria.reduce((sum, term) => sum + term.weightPercent, 0) - 100) > 0.000001) {
    return { status: "unavailable", reason: "The program’s criteria are incomplete or invalid." };
  }
  const terms = [];
  for (const criterion of criteria) {
    const matches = scores.filter(score => score.id === criterion.scoreId);
    const score = matches[0];
    if (matches.length !== 1 || !score || !Number.isFinite(score.score) || !Number.isFinite(score.maximum)
      || score.maximum <= 0 || score.score < 0 || score.score > score.maximum) {
      return { status: "unavailable", reason: "A required subject score is missing or invalid." };
    }
    terms.push({ subject: score.subject, label: score.label, score: score.score, maximum: score.maximum, weightPercent: criterion.weightPercent, contribution: score.score / score.maximum * criterion.weightPercent });
  }
  // Stable summation order makes canonical-equivalent component sets produce
  // exactly the same unrounded ranking score, while preserving display order.
  const rawTotal = terms.map(term => term.contribution).sort((a,b) => a-b).reduce((sum,value) => sum+value,0);
  return { status: "calculated", total: Math.round((rawTotal + Number.EPSILON) * 100) / 100, rawTotal, terms };
};

/** Fail closed: a flag, hash, demo proof, or evidence for a different claim is insufficient. */
export const resultCheckState = (kind: ResultVerificationKind, check: ResultVerificationCheck): "verified" | "not_verified" | "unavailable" => {
  const proof = check.evidence;
  if (check.status !== "verified") return check.status;
  if (!proof || proof.source !== "live" || proof.kind !== kind || !proof.reference.trim()
    || !Number.isFinite(Date.parse(proof.checkedAt))) return "not_verified";
  if (proof.kind === "score_authenticity") return proof.issuerAuthenticated && proof.signatureValid ? "verified" : "not_verified";
  if (proof.kind === "result_integrity") return proof.chainInclusionVerified && proof.privateRecordMatchesCommitment ? "verified" : "not_verified";
  return proof.completeAuthenticatedInputs && proof.publishedAlgorithmVerified && proof.recomputedOutcomeMatches ? "verified" : "not_verified";
};

export const walletCanShowAdmissionToken = (wallet: { admission: { status: string } }): boolean => wallet.admission.status !== "not_admitted";
