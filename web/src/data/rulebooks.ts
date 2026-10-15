import type { Program, RankedProgramResult } from "../domain/models";
import { examComponents, type AdmissionRulebook } from "../domain/rulebooks";

const seed = (programId:string, institutionId:string, programName:string, capacity:number, weights:Record<string,number>): AdmissionRulebook => ({
  id:`${programId}-v1`, programId, institutionId, programName, faculty:programName === "Computer Science" ? "Science and Technology" : programName === "Business Administration" ? "Business Administration" : programName === "Digital Design" ? "Architecture and Design" : "Engineering",
  academicYear:2027, round:"Round 3", capacity, version:1, method:"normalized-weighted-sum",
  components:Object.entries(weights).map(([id,weightPercent]) => ({ ...examComponents.find(c => c.scoreId === id)!, weightPercent, minimumPercent:id === "tgat" || id === "math1" ? 50 : null })),
  requiredSubjects:Object.keys(weights), qualifications:[], status:"preview", createdAt:"2026-10-12T03:00:00.000Z", sealedAt:"2026-10-12T03:00:00.000Z", commitment:null, chainReference:null, publication:null,
});
export const seedRulebooks = (programs:readonly Program[]): AdmissionRulebook[] => [
  seed("demo-cu-engineering","chulalongkorn","Computer Engineering",50,{tgat:20,tpat3:20,math1:40,physics:20}),
  ...programs.map(p => ({ ...seed(p.id,p.institutionId,p.name,p.capacity,p.id === "computer-engineering-2027" ? {tgat:20,tpat3:30,math1:30,physics:20} : p.name === "Business Administration" ? {tgat:40,math1:60} : {tgat:40,tpat3:30,math1:30}), ...(p.id !== "computer-engineering-2027" ? {status:"draft" as const,sealedAt:null} : {}) })),
  seed("demo-tu-computing","thammasat","Computer Science",40,{tgat:30,math1:50,physics:20}),
];
export const choiceFromRulebook = (rule:AdmissionRulebook, rank:number): RankedProgramResult => ({ id:`choice-${rank}-${rule.programId}`, rank, institutionId:rule.institutionId, programName:rule.programName, programId:rule.programId, rulebookId:rule.id, rulebookVersion:rule.version, reportedOutcome:"not_admitted" });
