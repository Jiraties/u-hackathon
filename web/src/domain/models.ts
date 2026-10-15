import type { AdmissionRulebook } from "./rulebooks";
/** Shared domain models. Personal records belong to a private API;
 * public registry projections must omit student identity and exam scores. */
export type CredentialStatus = "active" | "withdrawn" | "revoked";
export type AdmissionStatus = "offered" | "confirmed" | "enrolled" | "withdrawn";
export type EvidenceSource = "fixture" | "api" | "chain";
export interface ChainReference {
  chainId: number;
  contractAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: string;
}
export interface Institution { id: string; name: string; abbreviation: string; issuerLabel: string }
export interface Program {
  id: string; institutionId: string; name: string; degree: string; academicYear: number;
  capacity: number; activeCredentials: number; historicalIssued: number;
  withdrawn: number; revoked: number; awaitingIssuance: number;
}
export interface ScoreRecord {
  id: string; subject: string; label: string; score: number; maximum: number;
  provenance: "simulated-exam-provider";
}
export interface PublicCredential {
  id: string; institutionId: string; programId: string; type: "admission" | "diploma";
  status: CredentialStatus; issuedOn: string; source: EvidenceSource; chainReference: ChainReference | null;
}
export interface StudentWallet {
  student: { id: string; givenName: string; fullName: string; initials: string };
  scores: readonly ScoreRecord[];
  qualifications: Record<string, string>;
  admission: { programId: string; status: AdmissionStatus; confirmedOn: string }
    | { status: "not_admitted"; result: PrivateAdmissionResult };
  credentials: readonly PublicCredential[];
}

/** A result attestation describes an outcome; it never grants an admission right.
 * This private record is deliberately separate from PublicCredential. */
export interface AdmissionResultAttestation {
  kind: "admission_result";
  id: string;
  outcome: "not_admitted";
  academicYear: number;
  round: string;
  reportedOn: string;
  issuerLabel: string;
  source: EvidenceSource;
  grantsAdmissionRight: false;
  previewRunId?: string;
}
export interface RankedProgramResult {
  id: string;
  rank: number;
  institutionId: string;
  programName: string;
  programId: string;
  rulebookId: string;
  rulebookVersion: number;
  reportedOutcome: "not_admitted";
}
export type ResultVerificationKind = "score_authenticity" | "result_integrity" | "allocation_correctness";
export type ResultVerificationEvidence = {
  source: "live" | "fixture";
  checkedAt: string;
  reference: string;
} & (
  | { kind: "score_authenticity"; issuerAuthenticated: boolean; signatureValid: boolean }
  | { kind: "result_integrity"; chainInclusionVerified: boolean; privateRecordMatchesCommitment: boolean }
  | { kind: "allocation_correctness"; completeAuthenticatedInputs: boolean; publishedAlgorithmVerified: boolean; recomputedOutcomeMatches: boolean }
);
export interface ResultVerificationCheck {
  status: "verified" | "not_verified" | "unavailable";
  explanation: string;
  evidence: ResultVerificationEvidence | null;
}
/** Only this opaque commitment projection may be published; never the private result. */
export interface PublicResultCommitment {
  id: string;
  scheme: "salted-record-commitment";
  value: `0x${string}` | null;
  chainReference: ChainReference | null;
}
export interface PrivateAdmissionResult {
  attestation: AdmissionResultAttestation;
  rankedPrograms: readonly RankedProgramResult[];
  verification: Record<ResultVerificationKind, ResultVerificationCheck>;
  publicCommitment: PublicResultCommitment;
}
export interface IssuanceRecord {
  id: string; applicantReference: string; programId: string; confirmedOn: string; status: "ready" | "issued";
}
export interface AuditEvent {
  id: string; programId: string; kind: "capacity_registered" | "credential_issued" | "credential_withdrawn";
  title: string; description: string; dateLabel: string; timeLabel: string; chainReference: ChainReference | null;
}

/** Presentation input; can be composed from fixtures or future service adapters. */
export interface FairPassViewData {
  rulebooks: readonly AdmissionRulebook[];
  institution: Institution;
  institutions: readonly Institution[];
  programs: readonly Program[];
  wallet: StudentWallet;
  demoWallets: readonly StudentWallet[];
  issuanceRecords: readonly IssuanceRecord[];
  auditEvents: readonly AuditEvent[];
  admissionCredential: PublicCredential;
  verificationCredentials: readonly PublicCredential[];
}
