import { createWebHost } from './http.js';
import { ensureLocalDemoAccounts } from './localDemoAccounts.js';
import { readConfig } from './config.js';
import { createChain } from './chain.js';
import { connectStore } from './store.js';
import { createApp } from './app.js';
const config = readConfig();
if (new Set([config.ADMIN_API_TOKEN, config.INTEGRATION_API_TOKEN, config.ISSUER_API_TOKEN]).size !== 3) throw new Error('Use three distinct API tokens');
const chain = createChain(config);
const { store, close } = await connectStore(config.MONGODB_URI, config.MONGODB_DATABASE);
await chain.ready();
await ensureLocalDemoAccounts(store, {
  local: process.env.FAIRPASS_LOCAL === 'true', chainId: config.CHAIN_ID,
  password: process.env.DEMO_PASSWORD, institutionId: config.INSTITUTION_ID,
});
const app = createApp(config, store, chain);
const host = config.WEB_DIST_DIR ? createWebHost(app, config.WEB_DIST_DIR, config.DEMO_REPLAY_API_URL) : app;
const server = host.listen(config.PORT, config.HOST, () => console.log(`FairPass API listening on ${config.HOST}:${config.PORT} (chain ${config.CHAIN_ID})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(() => { void app.locals.closeScoring().then(close).then(() => process.exit(0)); }); });
