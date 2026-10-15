import { resultCheckState } from "./admissionResults";
import type { ResultVerificationCheck, ResultVerificationKind, ScoreRecord } from "./models";

export type ProofStatus = "verified" | "inspectable" | "pending" | "unverified" | "failed";
export const proofStatuses = {
  verified: { label: "Verified", icon: "check", tone: "green" },
  inspectable: { label: "Available to inspect", icon: "search", tone: "blue" },
  pending: { label: "Pending", icon: "clock", tone: "neutral" },
  unverified: { label: "Not independently verified", icon: "info", tone: "neutral" },
  failed: { label: "Verification failed", icon: "info", tone: "amber" },
} as const;

/** A UI gate, not a cryptographic verifier. Adapters must supply validated evidence. */
export const verificationProofStatus = (kind: ResultVerificationKind, check: ResultVerificationCheck): ProofStatus =>
  resultCheckState(kind, check) === "verified" ? "verified" : "unverified";

export const eligibilityFor = (scores: readonly ScoreRecord[], minimums: readonly { scoreId: string; minimumPercent: number }[]): "met" | "not_met" | "unavailable" => {
  if (!minimums.length) return "unavailable";
  let met = true;
  for (const rule of minimums) {
    const matches = scores.filter(score => score.id === rule.scoreId);
    const score = matches[0];
    if (matches.length !== 1 || !score || !Number.isFinite(score.score) || !Number.isFinite(score.maximum)
      || score.maximum <= 0 || score.score < 0 || score.score > score.maximum
      || !Number.isFinite(rule.minimumPercent) || rule.minimumPercent < 0 || rule.minimumPercent > 100) return "unavailable";
    if (score.score / score.maximum * 100 < rule.minimumPercent) met = false;
  }
  return met ? "met" : "not_met";
};

