import type { AdmissionRulebook } from "../domain/rulebooks";
export interface ProgramMetadata {
  institutionName: string;
  programName: string;
  faculty?: string;
  rulebookId?: string;
  degree?: string;
}
export interface ChainInfo {
  chainId: number;
  contractAddress: string;
  deploymentBlock: string;
  protocolVersion?: number;
}
export interface Receipt {
  chainId: number;
  contractAddress: string;
  transactionHash: string;
  blockNumber: string;
}
export interface PublicProgram extends ChainInfo {
  currentRules?: boolean;
  scoringRulesHash?: string | null;
  metadata?: ProgramMetadata;
  programId: string;
  issuer: string;
  academicYear: number;
  capacity: number;
  active: number;
  historicalIssued: number;
  issuanceAllowance: number;
  rulesHash: string;
  lockedAt: string;
  rulesMatch: boolean;
  rules: unknown;
  rulebook: AdmissionRulebook | null;
  registration: Receipt | null;
  lock: Receipt | null;
}
export interface Credential extends ChainInfo {
  metadata?: ProgramMetadata;
  credentialId: string;
  programId: string;
  issuer: string;
  academicYear: number;
  status: "valid" | "withdrawn" | "revoked";
  lifecycle: "valid" | "enrolled" | "withdrawn" | "revoked";
  issuerCurrentlyAuthorized: boolean;
  holderIdentityVerified: false;
}
export interface ScoringEvidence {
  programName?: string;
  programId: string;
  status: "verified" | "not_verified";
  reason?: string;
  calculatedScore?: number;
  eligible?: boolean;
  ruleVersion?: number;
  datasetId?: string;
  totalCommitment?: string;
  verifiedAt?: string;
  verification?: Receipt | null;
}
export interface WalletRecord {
  scoring?: ScoringEvidence[];
  program?: ProgramMetadata | null;
  resultId: string;
  commitment: string;
  confirmationRequestedAt: string | null;
  publication: Receipt | null;
  issuance: Receipt | null;
  report: {
    academicYear: number;
    round: string;
    outcome: "admitted" | "not_admitted";
    programId: string | null;
    scores: Record<string, number>;
    preferences?: string[];
    trace?: { programId: string }[];
    programName?: string;
    scoreRecords?: import("../domain/models").ScoreRecord[];
    qualifications?: Record<string, string>;
    source: string;
    rulebooks?: AdmissionRulebook[];
    runId?: string;
  };
  credential: {
    credentialId: string;
    programId: string;
    status: Credential["status"];
    lifecycle: Credential["lifecycle"];
  } | null;
}
export interface Wallet extends ChainInfo {
  institutionName?: string;
  student: { id: string; name: string };
  records: WalletRecord[];
}
export interface Proof extends ChainInfo {
  scoring?: ScoringEvidence[];
  resultId: string;
  report: WalletRecord["report"];
  salt: string;
  scheme: string;
  verification: {
    resultIntegrity: string;
    scoreAuthenticity: string;
    allocationCorrectness: string;
  };
  publication: Receipt | null;
  onchainCommitment: string;
  recordedAt: string;
}
export interface OfficeResult {
  scoring?: ScoringEvidence[];
  publication: Receipt | null;
  resultId: string;
  studentId: string;
  outcome: string;
  programId: string | null;
  confirmationRequestedAt: string | null;
  credential: WalletRecord["credential"];
  issuance: Receipt | null;
}
export interface EventPage {
  fromBlock: string;
  toBlock: string;
  nextBlock: string | null;
  events: {
    event: string;
    args: Record<string, unknown>;
    transactionHash: string;
    blockNumber: string;
    logIndex: number;
  }[];
}
export interface Session {
  token: string;
  expiresAt: string;
  institutionId?: string;
  name?: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export const bytes32 = /^0x[0-9a-fA-F]{64}$/;
export async function api<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(0, "network_unavailable");
  }
  if (response.status === 204) return undefined as T;
  const body = await response
    .json()
    .catch(() => ({ error: "invalid_server_response" }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error ?? body.status ?? "request_failed",
    );
  return body as T;
}
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return error instanceof Error ? error.message : "Operation unavailable.";
  if(error.code === "authenticated_exam_record_required") return "The exam authority has not authenticated a matching score record yet. Ask the admissions team to check the exam dataset.";
  if(error.code === "result_scores_do_not_match_authenticated_exam_record") return "These result scores do not match the authenticated exam record. Verification has stopped; ask the admissions team to review the source records.";
  if(error.code === "verified_eligible_scoring_required") return "Verify this applicant’s score calculation and eligibility before issuing an admission token.";
  if(error.code === "zk_registry_upgrade_required") return "This registry cannot verify private scoring proofs. Connect the verified-scoring registry first.";
  if (error.status === 401 && error.code === "invalid_credentials")
    return "The ID or password is incorrect. Check your account ID and use the sign-in page for your account type.";
  if (error.status === 401)
    return "Your session has expired or is no longer valid. Please sign in again.";
  if (error.status === 403)
    return "This account cannot manage that institution or program.";
  if (error.status === 404) return "No record was found for this ID.";
  if (error.status === 400)
    return "Check the fields and use a full 0x + 64 hex character ID where required.";
  if (error.status === 429)
    return "Too many requests. Please wait before trying again.";
  if (error.status === 409)
    return `This operation conflicts with saved state (${error.code}). Retry the same request after checking its status.`;
  return "The service is unavailable. Please retry; no successful blockchain operation is being claimed.";
}
