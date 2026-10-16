import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import express, { type RequestHandler, type Express } from 'express';
import type { HelmetOptions } from 'helmet';

// Helmet 8's CJS export is callable; load it explicitly across ESM/hosted TS compilers.
export const securityHeaders = createRequire(import.meta.url)('helmet') as
  (options?: Readonly<HelmetOptions>) => RequestHandler;

export const createWebHost = (api: Express, directory: string, replayUrl?: string): Express => {
  const root = path.resolve(directory);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Built frontend index.html is missing');
  const host = express();
  host.disable('x-powered-by');
  host.use(securityHeaders());
  if (replayUrl) {
    const upstream = new URL(replayUrl);
    if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Replay API must use HTTP');
    host.use('/api/v1/demo', async (req, res) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { res.status(403).json({error:'read_only_replay'}); return; }
      try {
        const target = new URL('/v1/demo' + req.url, upstream);
        if (!target.pathname.startsWith('/v1/demo/')) { res.sendStatus(404); return; }
        // Public replay never inherits a browser's institutional session or credentials.
        const response = await fetch(target, {method:req.method,headers:{Accept:'application/json'},signal:AbortSignal.timeout(120000)});
        res.status(response.status);
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Type',response.headers.get('Content-Type') ?? 'application/json');
        res.send(Buffer.from(await response.arrayBuffer()));
      } catch { res.status(503).json({error:'replay_unavailable'}); }
    });
  }
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
