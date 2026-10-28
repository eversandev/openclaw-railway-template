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

test('Media submission is server-side, isolated, bounded and accepts all three schemas', async () => {
 const stateDir=mkdtempSync(path.join(tmpdir(),'studio-media-'));let calls=[];
 const mock=async(url,options)=>{
  calls.push({url,options});
  if(options.method==='POST')return Response.json({status_url:'https://queue.fal.run/test/requests/one/status',response_url:'https://queue.fal.run/test/requests/one'});
  if(url.endsWith('/status'))return Response.json({status:'COMPLETED'});
  return Response.json({images:[{url:'https://fal.media/image.png'},{url:'javascript:alert(1)'}]});
 };
 const app=express();app.use(express.json());const store=mountStudio(app,{stateDir,secureCookies:false,falKey:'test-secret',falFetch:mock});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const req=(route,body,cookie)=>fetch(origin+'/studio/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await req('media',{kind:'images',prompt:'x'})).status,401);assert.equal(calls.length,0);
  const reg=await req('register',{email:'media@example.com',password:'a-long-test-password'});const cookie=reg.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('media',{kind:'admin',prompt:'x'},cookie)).status,400);
  for(const kind of ['images','video','music']){
   const response=await req('media',{kind,prompt:'Teste de geração',options:{ratio:'9:16',duration:'4s',resolution:'720p',lyrics:'Letra original de teste'}},cookie);assert.equal(response.status,202);
   const job=await response.json();assert.equal(JSON.stringify(job).includes('test-secret'),false);assert.equal('status_url' in job,false);
   const call=calls.findLast(c=>c.options.method==='POST');const input=JSON.parse(call.options.body);
   assert.equal(call.options.headers.Authorization,'Key test-secret');assert.ok(input.prompt.includes('Teste de geração'));
   if(kind==='images')assert.equal(input.num_images,1);if(kind==='video')assert.equal(input.duration,'4s');if(kind==='music')assert.equal(input.lyrics,'Letra original de teste');
   const before=calls.length;assert.equal((await req('media',{kind,prompt:'duplicate'},cookie)).status,409);assert.equal(calls.length,before);
   const stranger=await req('register',{email:kind+'@other.example',password:'another-long-password'});const other=stranger.headers.get('set-cookie').split(';')[0];
   assert.equal((await req('media/'+job.id,undefined,other)).status,404);
   const result=await (await req('media/'+job.id,undefined,cookie)).json();assert.equal(result.status,'COMPLETED');assert.deepEqual(result.result,[{url:'https://fal.media/image.png'}]);
  }
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(stateDir,{recursive:true,force:true})}
});

test('Chat stores replies with context and isolates histories between users', async () => {
 const stateDir=mkdtempSync(path.join(tmpdir(),'studio-chat-'));const runs=[];
 const app=express();app.use(express.json());const store=mountStudio(app,{stateDir,secureCookies:false,chatRunner:async messages=>{runs.push(messages);return 'Resposta de teste';}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const req=(route,body,cookie)=>fetch(origin+'/studio/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await req('chat',{message:'Olá'})).status,401);
  const a=await req('register',{email:'chat@example.com',password:'long-test-password'});const ca=a.headers.get('set-cookie').split(';')[0];
  const b=await req('register',{email:'stranger@example.com',password:'long-test-password'});const cb=b.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('chat',{message:''},ca)).status,400);
  const r=await req('chat',{message:'Olá'},ca);assert.equal(r.status,200);const result=await r.json();assert.equal(result.reply,'Resposta de teste');
  assert.equal((await req('chats/'+result.chatId,undefined,cb)).status,404);
  assert.equal((await req('chat',{message:'Espiar',chatId:result.chatId},cb)).status,404);
  assert.equal((await req('chat',{message:'Continue',chatId:result.chatId},ca)).status,200);assert.equal(runs[1].length,3);assert.equal(runs[1][0].content,'Olá');
  const history=await(await req('chats/'+result.chatId,undefined,ca)).json();assert.equal(history.messages.length,4);
  assert.deepEqual(await(await req('chats',undefined,cb)).json(),[]);
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(stateDir,{recursive:true,force:true})}
});
