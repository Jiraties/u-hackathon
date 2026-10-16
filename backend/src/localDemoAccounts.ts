import type { Store } from './store.js';
import { passwordHash } from './crypto.js';

/** Create missing fictional local accounts after a new local chain/database cycle.
 * Never change an existing password or provision accounts on external networks. */
export async function ensureLocalDemoAccounts(
  store: Pick<Store, 'students' | 'operators'>,
  settings: { local: boolean; chainId: number; password?: string; institutionId: string },
) {
  if (!settings.local || settings.chainId !== 31337) return;
  const password = settings.password;
  if (!password || (password !== 'password' && (password.length < 12 || password.length > 128))) {
    throw new Error('Local demo startup requires DEMO_PASSWORD (password or 12–128 characters)');
  }
  const insert = async (work: () => Promise<unknown>) => {
    try { await work(); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  };
  for (const [id, name] of [['demo-pim', 'Pim (fictional)'], ['demo-narin', 'Narin (fictional)']]) {
    if (!await store.students.findOne({ _id: id })) {
      await insert(async () => store.students.insertOne({ _id: id, name, passwordHash: await passwordHash(password) }));
    }
  }
  if (!await store.operators.findOne({ _id: 'demo-office' })) {
    await insert(async () => store.operators.insertOne({ _id: 'demo-office', name: 'Demo officer', institutionId: settings.institutionId, passwordHash: await passwordHash(password) }));
  }
}
