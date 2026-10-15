import { MongoClient, type Collection } from 'mongodb';
import type { Hex } from 'viem';
import type { ChainReference } from './chain.js';
export type Student = { _id: string; name: string; passwordHash: string };
export type Session = { _id: string; studentId: string; expiresAt: Date };
export type ProgramDoc = { _id: Hex; rules: unknown; rulesHash: Hex; year: number; capacity: number; registration?: ChainReference; lock?: ChainReference };
export type ResultDoc = {
  _id: string; studentId: string; resultId: Hex; credentialId: Hex; subject: Hex; salt: Hex;
  report: { academicYear: number; round: string; outcome: 'admitted' | 'not_admitted'; programId: Hex | null; scores: Record<string, number>; preferences: Hex[]; trace: unknown; source: 'fictional-simulator' | 'external-adapter' };
  commitment: Hex; inputHash: Hex; publication?: ChainReference; confirmationRequestedAt?: Date; confirmation?: ChainReference; issuance?: ChainReference;
};
export interface Store {
  students: Pick<Collection<Student>, 'findOne' | 'insertOne'>;
  sessions: Pick<Collection<Session>, 'findOne' | 'insertOne' | 'deleteOne'>;
  programs: Pick<Collection<ProgramDoc>, 'findOne' | 'insertOne' | 'updateOne' | 'find'>;
  results: Pick<Collection<ResultDoc>, 'findOne' | 'insertOne' | 'updateOne' | 'find'>;
  subject(studentId: string, year: number, candidate: Hex): Promise<Hex>;
  ping(): Promise<void>;
}
export async function connectStore(uri: string, name: string) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(name);
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
  const store: Store = { students, sessions, programs, results,
    async subject(studentId, year, candidate) {
      const _id = `${studentId}:${year}`;
      try { await subjects.updateOne({ _id }, { $setOnInsert: { value: candidate } }, { upsert: true }); }
      catch (error) { if ((error as {code?: number}).code !== 11000) throw error; }
      return (await subjects.findOne({ _id }))!.value;
    },
    async ping() { await db.command({ ping: 1 }); },
  };
  return { store, close: () => client.close() };
}
