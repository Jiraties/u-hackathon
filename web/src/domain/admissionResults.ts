import type { ResultVerificationCheck, ResultVerificationKind } from "./models";

export { calculateProgramScore } from "../../../backend/shared/domain";
export type { ProgramScoreCalculation } from "../../../backend/shared/domain";

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
