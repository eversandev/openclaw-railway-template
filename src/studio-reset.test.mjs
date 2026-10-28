import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {mountStudio} from './studio.js';
test('Password reset is single-use, revokes sessions and preserves account data across restart',async()=>{
 const stateDir=mkdtempSync(path.join(tmpdir(),'studio-reset-'));const token=randomBytes(32).toString('hex');const tokenHash=createHash('sha256').update(token).digest('hex');const grant={email:'owner@example.test',tokenHash,expires:Date.now()+60000};
 let app,server,store,origin;const start=async()=>{app=express();app.use(express.json());store=mountStudio(app,{stateDir,secureCookies:false,resetGrant:grant});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}`};const stop=async()=>{await new Promise(r=>server.close(r));store.close()};
 const req=(route,body,cookie)=>fetch(origin+'/studio/api/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{await start();const reg=await req('register',{email:grant.email,password:'original-password-123'});const cookie=reg.headers.get('set-cookie').split(';')[0];await req('draft',{kind:'images',prompt:'Minha criação preservada'},cookie);
 assert.equal((await req('password-reset/check',{token:'invalid'})).status,400);assert.equal((await req('password-reset/check',{token})).status,200);assert.equal((await req('password-reset',{token,password:'short'})).status,400);
 const other=await req('register',{email:'other@example.test',password:'other-password-123'});const otherCookie=other.headers.get('set-cookie').split(';')[0];
 const attempts=await Promise.all([req('password-reset',{token,password:'new-password-secure-123'}),req('password-reset',{token,password:'new-password-secure-123'})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
 assert.equal((await req('me',undefined,cookie)).status,401);assert.equal((await req('me',undefined,otherCookie)).status,200);assert.equal((await req('login',{email:grant.email,password:'original-password-123'})).status,401);
 const login=await req('login',{email:grant.email,password:'new-password-secure-123'});assert.equal(login.status,200);const me=await(await req('me',undefined,login.headers.get('set-cookie').split(';')[0])).json();assert.equal(me.drafts[0].prompt,'Minha criação preservada');
 await stop();await start();assert.equal((await req('password-reset/check',{token})).status,400);
 }finally{if(server?.listening)await stop();rmSync(stateDir,{recursive:true,force:true})}
});
