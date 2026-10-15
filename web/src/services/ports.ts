import type { AuditEvent, ChainReference, IssuanceRecord, PrivateAdmissionResult, Program, PublicCredential, StudentWallet } from "../domain/models";

/** Authenticated private access only. Result reports contain scores and preferences. */
export interface AdmissionResultBackend {
  getAdmissionResult(studentId: string): Promise<PrivateAdmissionResult | null>;
}

/** Private backend boundary. Implement with authenticated HTTP requests later. */
export interface AdmissionsBackend {
  getWallet(studentId: string): Promise<StudentWallet>;
  getConfirmedAdmissions(institutionId: string): Promise<readonly IssuanceRecord[]>;
}
/** Public reads must ultimately use contract state/events, not editable API counters. */
export interface PublicRegistry {
  getPrograms(institutionId: string): Promise<readonly Program[]>;
  getCredential(credentialId: string): Promise<PublicCredential | null>;
  getAuditEvents(programId: string): Promise<readonly AuditEvent[]>;
}
/** Future authorized signer boundary. No implementation is wired into this UI. */
export interface RegistryWriter {
  registerCapacity(input: { programId: string; capacity: number }): Promise<ChainReference>;
  issueAdmission(input: { programId: string; confirmationId: string; studentCommitment: `0x${string}` }): Promise<ChainReference>;
  changeStatus(input: { credentialId: string; status: "withdrawn" | "revoked" }): Promise<ChainReference>;
}
