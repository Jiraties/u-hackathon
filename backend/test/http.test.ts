import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createWebHost } from '../src/http.js';

test('production host serves SPA routes, preserves API responses and security headers', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fairpass-host-'));
  try {
    fs.writeFileSync(path.join(root,'index.html'), '<!doctype html><title>FairPass</title>');
    const api=express();
    api.get('/ready', (_req,res)=>res.json({ready:true}));
    api.post('/v1/private', (_req,res)=>res.status(403).json({error:'read_only_replay'}));
    api.use((_req,res)=>res.status(404).json({error:'not_found'}));
    const host=createWebHost(api,root);
    for (const route of ['/', '/demo/students', '/university']) {
      const response=await request(host).get(route).expect(200).expect('Content-Type', /html/);
      assert.equal(response.headers['x-content-type-options'],'nosniff');
      assert.ok(response.headers['content-security-policy']);
      assert.equal(response.headers['x-powered-by'],undefined);
    }
    await request(host).get('/api/ready').expect(200,{ready:true});
    await request(host).post('/api/v1/private').expect(403,{error:'read_only_replay'});
    await request(host).get('/api/missing').expect(404,{error:'not_found'});
    await request(host).get('/assets/missing.js').expect(404);
    await request(host).get('/healthz').expect(200,'ok');
    assert.throws(()=>createWebHost(api,path.join(root,'missing')),/index.html is missing/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});


test('demo proxy uses keyless upstream and never forwards institution credentials or writes', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fairpass-proxy-'));
  const replay=express();
  replay.get('/v1/demo/world', (req,res)=>res.json({query:req.query,authorization:req.headers.authorization??null,cookie:req.headers.cookie??null}));
  const listener=replay.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>listener.once('listening',resolve));
  try {
    fs.writeFileSync(path.join(root,'index.html'), '<!doctype html><title>FairPass</title>');
    const api=express();api.get('/ready',(_req,res)=>res.json({ready:true}));
    const port=(listener.address() as import('node:net').AddressInfo).port;
    const host=createWebHost(api,root,`http://127.0.0.1:${port}`);
    await request(host).get('/api/v1/demo/world?student=Pim').set('Authorization','Bearer private-institution-session').set('Cookie','private-cookie=1').expect(200,{query:{student:'Pim'},authorization:null,cookie:null});
    await request(host).post('/api/v1/demo/world').expect(403,{error:'read_only_replay'});
    await request(host).get('/api/ready').expect(200,{ready:true});
  } finally {listener.close();fs.rmSync(root,{recursive:true,force:true});}
});
