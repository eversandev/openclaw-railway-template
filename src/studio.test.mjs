import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mountStudio } from './studio.js';

test('Studio accounts protect and isolate private drafts; logout revokes sessions', async () => {
 const stateDir=mkdtempSync(path.join(tmpdir(),'studio-test-'));
 const app=express();app.use(express.json());const store=mountStudio(app,{stateDir,secureCookies:false});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 async function request(route,body,cookie,source=origin){return fetch(origin+'/studio/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:source,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})}
 try{
  assert.equal((await request('me')).status,401);
  assert.equal((await request('draft',{kind:'images',prompt:'private'})).status,401);
  assert.equal((await request('register',{email:'a@example.com',password:'a-long-password'},null,'https://evil.example')).status,403);
  assert.equal((await request('register',{email:'a@example.com',password:'short'})).status,400);
  const a=await request('register',{email:'a@example.com',password:'a-long-password'});assert.equal(a.status,200);const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await request('register',{email:'b@example.com',password:'b-long-password'});assert.equal(b.status,200);const cb=b.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('draft',{kind:'images',prompt:'private image'},ca)).status,200);
  assert.equal((await request('draft',{kind:'../../config',prompt:'bad'},ca)).status,400);
  const ua=await (await request('me',undefined,ca)).json();assert.deepEqual(ua.drafts,[{kind:'images',prompt:'private image'}]);assert.equal('token' in ua,false);
  const ub=await (await request('me',undefined,cb)).json();assert.deepEqual(ub.drafts,[]);
  assert.equal((await request('login',{email:'a@example.com',password:'incorrect-password'})).status,401);
  assert.equal((await request('logout',{},ca)).status,200);
  assert.equal((await request('me',undefined,ca)).status,401);
  assert.equal((await request('login',{email:'a@example.com',password:'a-long-password'})).status,200);
  const asset=await fetch(origin+'/studio/');assert.equal(asset.status,200);assert.match(asset.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(stateDir,{recursive:true,force:true})}
});
