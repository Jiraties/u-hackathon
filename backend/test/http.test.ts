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


test('demo proxy reaches the production replay host without forwarding institution credentials or writes', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fairpass-proxy-'));
  fs.writeFileSync(path.join(root,'index.html'), '<!doctype html><title>FairPass</title>');
  const replayApi=express();
  replayApi.get('/v1/demo/world', (req,res)=>res.json({query:req.query,authorization:req.headers.authorization??null,cookie:req.headers.cookie??null}));
  replayApi.use((_req,res)=>res.status(404).json({error:'not_found'}));
  // Railway runs the same production host: API routes live below /api.
  const replay=createWebHost(replayApi,root);
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

test('demo remains navigable while chain verification is pending or fails', {skip:process.env.FAIRPASS_BROWSER_TEST!=='1'}, async () => {
  const {chromium}=await import('playwright');
  const {createDemoScenario}=await import('../src/demo/scenario.js');
  const host=createWebHost(express(),path.resolve('../web/dist'));
  const listener=host.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>listener.once('listening',resolve));
  const browser=await chromium.launch({headless:true});
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    let requests=0;
    await page.route('**/api/v1/demo/world',async route=>{
      const attempt=++requests;
      await gate;
      if(attempt===1)await route.fulfill({status:503,json:{error:'rpc_unavailable'}});
      else await route.fulfill({json:{scenario:createDemoScenario('loading-browser'),state:'not_prepared',reason:'Prepared scenario only.',mode:'preparation',observedAt:new Date().toISOString(),network:null,programs:[],students:[],dataset:null,manifest:null,securityAvailable:false}});
    });
    const port=(listener.address() as import('node:net').AddressInfo).port;
    await page.goto(`http://127.0.0.1:${port}/demo`,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Admissions. Proof on-chain.'}).waitFor({timeout:5000});
    assert.equal(await page.locator('.demo-loading').count(),0);
    await page.getByRole('link',{name:'Explore the protocol',exact:true}).click();
    await page.getByRole('heading',{name:'Rules locked on-chain.',exact:true}).waitFor();
    assert.equal(await page.getByText('Locked on Avalanche',{exact:true}).count(),0);
    await page.locator('.demo-chapters a[href="/demo/proof"]').click();
    await page.getByRole('button',{name:'Reveal the public proof',exact:true}).click();
    assert.equal(await page.getByText('Calculation verified on Avalanche.',{exact:true}).count(),0);
    await page.locator('.demo-chapters a[href="/demo/verify"]').click();
    const check=page.getByRole('button',{name:'Check the changed score',exact:true});
    assert.equal(await check.isDisabled(),true);
    assert.equal(await page.locator('.demo-network.verified').count(),0);
    release();
    await page.locator('.demo-network.unavailable').first().waitFor();
    assert.equal(await check.isDisabled(),true);
    await page.getByRole('button',{name:'Refresh demo evidence',exact:true}).click();
    await page.getByText('Fuji deployment pending',{exact:true}).first().waitFor();
    await page.locator('.demo-header .wordmark').click();
    await page.getByRole('heading',{name:'Admissions. Proof on-chain.'}).waitFor();
    assert.equal(await page.locator('.demo-network.verified').count(),0);
    assert.deepEqual(errors,[]);
  } finally {release();await browser.close();listener.closeAllConnections();await new Promise<void>(resolve=>listener.close(()=>resolve()));}
});
