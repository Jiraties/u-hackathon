import { MongoClient, type Collection } from 'mongodb';
import type { AdmissionRulebook, PreviewApplicant } from '../shared/domain.js';
import type { Hex } from 'viem';
import type { ChainReference } from './chain.js';
export type Student = { _id: string; name: string; passwordHash: string };
export type Session = { _id: string; studentId: string; role?: 'student' | 'institution'; institutionId?: string; expiresAt: Date };
export type InstitutionalUser = { _id:string; name:string; institutionId:string; passwordHash:string };
export type SimulationRun = { _id:string; inputHash:Hex; institutionId:string; programIds?:Hex[]; rulebooks:AdmissionRulebook[]; applicants:PreviewApplicant[]; assignments:Record<string,string|null>; createdAt:Date; completedAt?:Date };

export type ProgramDoc = { _id: Hex; rules: unknown; rulesHash: Hex; year: number; capacity: number; registration?: ChainReference; lock?: ChainReference; simulationRunId?:string; institutionId?:string; rulebook?:AdmissionRulebook };
export type ResultDoc = {
  _id: string; studentId: string; resultId: Hex; credentialId: Hex; subject: Hex; salt: Hex;
  report: { academicYear: number; round: string; outcome: 'admitted' | 'not_admitted'; programId: Hex | null; scores: Record<string, number>; preferences: Hex[]; trace: unknown; source: 'fictional-simulator' | 'external-adapter'; rulebooks?:AdmissionRulebook[]; scoreRecords?:PreviewApplicant['scores']; qualifications?:Record<string,string>; runId?:string };
  commitment: Hex; inputHash: Hex; publication?: ChainReference; confirmationRequestedAt?: Date; confirmation?: ChainReference; issuance?: ChainReference;
};
export type RuleDraft = { _id:string; institutionId:string; revision:number; rule:AdmissionRulebook; updatedAt:Date };
export interface Store {
  drafts: Pick<Collection<RuleDraft>, 'find' | 'findOne' | 'updateOne'>;
  operators: Pick<Collection<InstitutionalUser>, 'findOne' | 'insertOne'>;
  runs: Pick<Collection<SimulationRun>, 'find' | 'findOne' | 'insertOne' | 'updateOne'>;
  students: Pick<Collection<Student>, 'find' | 'findOne' | 'insertOne'>;
  sessions: Pick<Collection<Session>, 'findOne' | 'insertOne' | 'deleteOne'>;
  programs: Pick<Collection<ProgramDoc>, 'findOne' | 'insertOne' | 'updateOne' | 'find'>;
  results: Pick<Collection<ResultDoc>, 'findOne' | 'insertOne' | 'updateOne' | 'find'>;
  subject(studentId: string, year: number, candidate: Hex): Promise<Hex>;
  ping(): Promise<void>;
}
export async function connectStore(uri: string, name: string) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
  const db = client.db(name);
  const drafts = db.collection<RuleDraft>('ruleDrafts');
  const operators = db.collection<InstitutionalUser>('operators');
  const runs = db.collection<SimulationRun>('runs');
  const students = db.collection<Student>('students');
  const sessions = db.collection<Session>('sessions');
  const programs = db.collection<ProgramDoc>('programs');
  const results = db.collection<ResultDoc>('results');
  const subjects = db.collection<{ _id: string; value: Hex }>('subjects');
  await Promise.all([
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    results.createIndex({ resultId: 1 }, { unique: true }),
    results.createIndex({ credentialId: 1 }, { unique: true }),
    results.createIndex({ studentId: 1 }),
  ]);
  const store: Store = { drafts, operators, runs, students, sessions, programs, results,
    async subject(studentId, year, candidate) {
      const _id = `${studentId}:${year}`;
      try { await subjects.updateOne({ _id }, { $setOnInsert: { value: candidate } }, { upsert: true }); }
      catch (error) { if ((error as {code?: number}).code !== 11000) throw error; }
      return (await subjects.findOne({ _id }))!.value;
    },
    async ping() { await db.command({ ping: 1 }); },
  };
  return { store, close: () => client.close() };
  } catch(error) { await client.close(); throw error; }
}
