import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import express, { type RequestHandler, type Express } from 'express';
import type { HelmetOptions } from 'helmet';

// Helmet 8's CJS export is callable; load it explicitly across ESM/hosted TS compilers.
export const securityHeaders = createRequire(import.meta.url)('helmet') as
  (options?: Readonly<HelmetOptions>) => RequestHandler;

export const createWebHost = (api: Express, directory: string): Express => {
  const root = path.resolve(directory);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Built frontend index.html is missing');
  const host = express();
  host.disable('x-powered-by');
  host.use(securityHeaders());
  host.use('/api', api);
  host.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));
  host.use(express.static(root, { index: false }));
  host.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(root, 'index.html'));
  });
  host.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return host;
};
