import { useState } from "react";
import type { RankedProgramResult, ScoreRecord } from "../domain/models";
import { evaluateRulebook, rulebookCommitment, validateRulebook, type AdmissionRulebook } from "../domain/rulebooks";
import { choiceFromRulebook } from "../data/rulebooks";

export interface PreviewApplicant { id:string; scores:readonly ScoreRecord[]; preferences:string[]; qualifications:Record<string,string> }
export interface AllocationPreview { id:string; createdAt:string; rulebookIds:string[]; assignments:Record<string,string|null>; applicants:number; choices:RankedProgramResult[]; studentAdmitted:boolean }
export interface RuleWorkspace { schema:1; rulebooks:AdmissionRulebook[]; runs:AllocationPreview[] }
const storageKey = "fairpass-rule-workspace-v1";

/** Fictional student-proposing deferred acceptance. Each program ranks by its own
 * unrounded normalized score; ties use opaque applicant IDs in codepoint order.
 * No authentic TCAS algorithm, inputs, or independent fairness verification is claimed. */
export const allocatePreview = (rules:readonly AdmissionRulebook[], applicants:readonly PreviewApplicant[]) => {
  if (new Set(rules.map(r=>r.programId)).size !== rules.length || rules.some(r=>validateRulebook(r).length)) throw new Error("Use one valid rulebook per program.");
  if (new Set(applicants.map(a=>a.id)).size !== applicants.length || applicants.some(a=>new Set(a.preferences).size !== a.preferences.length || a.preferences.some(p=>!rules.some(r=>r.programId===p)))) throw new Error("Applicant IDs and preferences must be unique and refer to supplied programs.");
  const queue = [...applicants]; const next = new Map(applicants.map(a=>[a.id,0]));
  const held = new Map<string,{id:string;score:number}[]>(rules.map(r=>[r.programId,[]]));
  while (queue.length) {
    const applicant = queue.shift()!; const index = next.get(applicant.id)!;
    if (index >= applicant.preferences.length) continue;
    const programId = applicant.preferences[index]; next.set(applicant.id,index+1);
    const rule = rules.find(r=>r.programId===programId)!;
    const evaluated = evaluateRulebook(rule,applicant.scores,applicant.qualifications);
    if (evaluated.status !== "calculated" || !evaluated.eligible) { queue.push(applicant); continue; }
    const pool = [...held.get(programId)!,{id:applicant.id,score:evaluated.rawTotal}].sort((a,b)=>b.score-a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rejected = pool.length > rule.capacity ? pool.pop() : undefined; held.set(programId,pool);
    if (rejected) queue.push(applicants.find(a=>a.id===rejected.id)!);
  }
  const assignments:Record<string,string|null> = Object.fromEntries(applicants.map(a=>[a.id,null]));
  for (const [program,students] of held) for (const student of students) assignments[student.id]=program;
  return assignments;
};
export const runAdmissionPreview = (rules:AdmissionRulebook[], student:PreviewApplicant, now:string):AllocationPreview => {
  // Complete synthetic cohort for this preview only. Every rival has stronger exam
  // scores than Narin's seed; no private data from real applicants is used.
  const scoreTemplates = Array.from(new Map(rules.flatMap(r=>r.components).map(c=>[c.scoreId,c])).values());
  const rivals:PreviewApplicant[] = Array.from({length:144},(_,index)=>({ id:`fictional-${String(index+1).padStart(3,"0")}`, preferences:[...student.preferences], qualifications:{curriculum:"Science–Mathematics"}, scores:scoreTemplates.map(c=>({ id:c.scoreId,subject:c.label,label:c.label,score:c.maximum*(0.72+(index%25)/100),maximum:c.maximum,provenance:"simulated-exam-provider" as const })) }));
  const assignments = allocatePreview(rules,[...rivals,student]);
  return { id:globalThis.crypto.randomUUID(), createdAt:now, rulebookIds:rules.map(r=>r.id), assignments, applicants:rivals.length+1, choices:student.preferences.map((id,index)=>choiceFromRulebook(rules.find(r=>r.programId===id)!,index+1)), studentAdmitted:assignments[student.id] !== null };
};
export const sealPreviewRulebook = async (rule:AdmissionRulebook, now:string):Promise<AdmissionRulebook> => {
  if (rule.status !== "draft") throw new Error("Historical versions cannot be overwritten. Create a new version.");
  return { ...structuredClone(rule), status:"preview", sealedAt:now, commitment:await rulebookCommitment(rule), chainReference:null, publication:null };
};
/** Only drafts may be replaced; historical snapshots are append-only. */
export const saveRulebookVersion = (workspace:RuleWorkspace, rule:AdmissionRulebook):RuleWorkspace => {
  const errors=validateRulebook(rule); if(errors.length) throw new Error(errors[0]);
  const old=workspace.rulebooks.find(r=>r.id===rule.id);
  if(old && old.status!=="draft") throw new Error("This historical version is immutable. Create a new version.");
  if(workspace.rulebooks.some(r=>r.id!==rule.id && r.programId===rule.programId && r.version===rule.version)) throw new Error("This version already exists.");
  return {...workspace,rulebooks:[...workspace.rulebooks.filter(r=>r.id!==rule.id),structuredClone(rule)]};
};
export const useRuleWorkspace = (seeds:readonly AdmissionRulebook[]) => {
  const [message,setMessage]=useState("");
  const [workspace,setWorkspace]=useState<RuleWorkspace>(()=>{
    try {
      const raw = localStorage.getItem(storageKey); if (!raw) return {schema:1,rulebooks:[...seeds],runs:[]};
      const parsed = JSON.parse(raw) as RuleWorkspace;
      if (parsed.schema !== 1 || !Array.isArray(parsed.rulebooks) || !Array.isArray(parsed.runs) || parsed.rulebooks.some(r=>validateRulebook(r).length) || new Set(parsed.rulebooks.map(r=>r.id)).size !== parsed.rulebooks.length) throw new Error("Invalid workspace");
      // Local storage can never supply authenticated chain receipts.
      const rulebooks = parsed.rulebooks.map(r=>({...r,status:r.status === "draft" ? "draft" as const : "preview" as const,chainReference:null,publication:null}));
      const runs = parsed.runs.filter(run=>typeof run.id === "string" && typeof run.createdAt === "string" && Array.isArray(run.rulebookIds) && run.rulebookIds.every(id=>rulebooks.some(r=>r.id===id)) && Array.isArray(run.choices) && run.choices.every(c=>rulebooks.some(r=>r.id===c.rulebookId && r.version===c.rulebookVersion && r.programId===c.programId)) && typeof run.studentAdmitted === "boolean" && typeof run.assignments === "object" && run.assignments !== null);
      return {schema:1,rulebooks,runs};
    } catch { return {schema:1,rulebooks:[...seeds],runs:[]}; }
  });
  const save = (next:RuleWorkspace) => {
    setWorkspace(next);
    try { localStorage.setItem(storageKey,JSON.stringify(next)); setMessage(""); }
    catch { setMessage("Browser storage is unavailable. Changes will last only on this page; reopening a student link will use the saved workspace."); }
  };
  const saveRule = (rule:AdmissionRulebook) => save(saveRulebookVersion(workspace,rule));
  const saveRun = (run:AllocationPreview) => save({...workspace,runs:[...workspace.runs,run]});
  return {workspace,saveRule,saveRun,message};
};
export type RuleWorkspaceController = ReturnType<typeof useRuleWorkspace>;
