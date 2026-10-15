import { seedRulebooks, choiceFromRulebook } from "./rulebooks";
import type { AuditEvent, FairPassViewData, Institution, IssuanceRecord, Program, PublicCredential, StudentWallet } from "../domain/models";

// Real Thai university names used illustratively. All records, counts, and issuers
// are simulated; no university affiliation or real issuance is implied.
export const institutions: readonly Institution[] = [
  { id: "kasetsart", name: "Kasetsart University", abbreviation: "KU", issuerLabel: "Thai university example · Simulated issuer" },
  { id: "chulalongkorn", name: "Chulalongkorn University", abbreviation: "CU", issuerLabel: "Thai university example · Simulated issuer" },
  { id: "thammasat", name: "Thammasat University", abbreviation: "TU", issuerLabel: "Thai university example · Simulated issuer" },
];
export const institution = institutions[0];
export const programs: readonly Program[] = [
  { id: "computer-engineering-2027", institutionId: institution.id, name: "Computer Engineering", degree: "Bachelor of Engineering", academicYear: 2027, capacity: 30, activeCredentials: 24, historicalIssued: 26, withdrawn: 2, revoked: 0, awaitingIssuance: 3 },
  { id: "business-2027", institutionId: institution.id, name: "Business Administration", degree: "Bachelor of Business Administration", academicYear: 2027, capacity: 40, activeCredentials: 32, historicalIssued: 34, withdrawn: 1, revoked: 1, awaitingIssuance: 2 },
  { id: "digital-design-2027", institutionId: institution.id, name: "Digital Design", degree: "Bachelor of Fine Arts", academicYear: 2027, capacity: 20, activeCredentials: 16, historicalIssued: 17, withdrawn: 1, revoked: 0, awaitingIssuance: 1 },
];
export const rulebooks = seedRulebooks(programs);
export const admissionCredential: PublicCredential = {
  id: "FP-2027-00842", institutionId: institution.id, programId: programs[0].id,
  type: "admission", status: "active", issuedOn: "15 Oct 2026", source: "fixture", chainReference: null,
};
export const verificationCredentials: readonly PublicCredential[] = [
  admissionCredential,
  { ...admissionCredential, id: "FP-2027-00818", status: "withdrawn", issuedOn: "12 Oct 2026" },
  { ...admissionCredential, id: "FP-2027-00804", programId: programs[1].id, status: "revoked", issuedOn: "11 Oct 2026" },
];
export const wallet: StudentWallet = {
  student: { id: "demo-student-001", givenName: "Pim", fullName: "Pimchanok Srisai", initials: "PS" },
  qualifications: { curriculum: "Science–Mathematics" },
  scores: [
    { id: "tgat", subject: "TGAT", label: "General Aptitude", score: 86.5, maximum: 100, provenance: "simulated-exam-provider" },
    { id: "tpat3", subject: "TPAT3", label: "Engineering Aptitude", score: 82, maximum: 100, provenance: "simulated-exam-provider" },
    { id: "math1", subject: "A-Level", label: "Mathematics 1", score: 91, maximum: 100, provenance: "simulated-exam-provider" },
  ],
  admission: { programId: programs[0].id, status: "confirmed", confirmedOn: "14 Oct 2026" },
  credentials: [admissionCredential],
};
export const nonAdmittedWallet: StudentWallet = {
  student: { id: "demo-student-002", givenName: "Narin", fullName: "Narin Wattanakul", initials: "NW" },
  qualifications: { curriculum: "Science–Mathematics" },
  scores: [
    { id: "tgat", subject: "TGAT", label: "General Aptitude", score: 61.5, maximum: 100, provenance: "simulated-exam-provider" },
    { id: "tpat3", subject: "TPAT3", label: "Engineering Aptitude", score: 58, maximum: 100, provenance: "simulated-exam-provider" },
    { id: "math1", subject: "A-Level", label: "Mathematics 1", score: 63, maximum: 100, provenance: "simulated-exam-provider" },
    { id: "physics", subject: "A-Level", label: "Physics", score: 56, maximum: 100, provenance: "simulated-exam-provider" },
  ],
  admission: {
    status: "not_admitted",
    result: {
      attestation: { kind: "admission_result", id: "FR-2027-00126", outcome: "not_admitted", academicYear: 2027, round: "Round 3 · Fictional admissions scenario", reportedOn: "15 Oct 2026", issuerLabel: "Demo admissions authority", source: "fixture", grantsAdmissionRight: false },
      rankedPrograms: [
        choiceFromRulebook(rulebooks.find(r => r.programId === "demo-cu-engineering")!, 1),
        choiceFromRulebook(rulebooks.find(r => r.programId === "computer-engineering-2027")!, 2),
        choiceFromRulebook(rulebooks.find(r => r.programId === "demo-tu-computing")!, 3),
      ],
      verification: {
        score_authenticity: { status: "not_verified", explanation: "These fictional scores have no authenticated examination-provider signature.", evidence: null },
        result_integrity: { status: "not_verified", explanation: "No report commitment has been published to or checked against Avalanche.", evidence: null },
        allocation_correctness: { status: "unavailable", explanation: "The complete authenticated applicant dataset and a verified allocation computation are not available.", evidence: null },
      },
      publicCommitment: { id: "DEMO-COMMITMENT-0126", scheme: "salted-record-commitment", value: null, chainReference: null },
    },
  },
  credentials: [],
};
export const demoWallets: readonly StudentWallet[] = [wallet, nonAdmittedWallet];

export const issuanceRecords: readonly IssuanceRecord[] = [
  { id: "CONF-0271", applicantReference: "Applicant 0271", programId: programs[0].id, confirmedOn: "15 Oct 2026", status: "ready" },
  { id: "CONF-0272", applicantReference: "Applicant 0272", programId: programs[0].id, confirmedOn: "15 Oct 2026", status: "ready" },
  { id: "CONF-0273", applicantReference: "Applicant 0273", programId: programs[0].id, confirmedOn: "15 Oct 2026", status: "ready" },
];
export const auditEvents: readonly AuditEvent[] = [
  { id: "evt-4", programId: programs[0].id, kind: "credential_issued", title: "Admission credential issued", description: "Computer Engineering · FP-2027-00842", dateLabel: "15 Oct 2026", timeLabel: "10:42", chainReference: null },
  { id: "evt-3", programId: programs[0].id, kind: "credential_withdrawn", title: "Admission right withdrawn", description: "Computer Engineering · Active count reduced by 1", dateLabel: "15 Oct 2026", timeLabel: "09:18", chainReference: null },
  { id: "evt-2", programId: programs[0].id, kind: "credential_issued", title: "Admission credential issued", description: "Computer Engineering · FP-2027-00840", dateLabel: "14 Oct 2026", timeLabel: "15:06", chainReference: null },
  { id: "evt-1", programId: programs[0].id, kind: "capacity_registered", title: "Program capacity registered", description: "Computer Engineering · 30 authorized seats", dateLabel: "12 Oct 2026", timeLabel: "11:30", chainReference: null },
];
export const demoData = { rulebooks, institution, institutions, programs, wallet, demoWallets, issuanceRecords, auditEvents, admissionCredential, verificationCredentials } satisfies FairPassViewData;
