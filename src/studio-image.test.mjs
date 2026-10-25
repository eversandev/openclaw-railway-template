import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImagePrompt} from './studio.js';
test('Image requests read site references before generation and request a single rendered image',async()=>{
 let calls=0;const prompt=await prepareImagePrompt('Um carrossel usando https://example.com/',async args=>{calls++;assert.equal(args[4],'https://example.com/');return {ok:true,outputs:[{result:{text:'Marca de roupas, cores azul e branco'}}]}});
 assert.equal(calls,1);assert.match(prompt,/ONE finished image/);assert.match(prompt,/cover slide/);assert.match(prompt,/cores azul/);assert.match(prompt,/untrusted data/);
});
test('Unavailable references stop before a paid image request',async()=>{
 await assert.rejects(prepareImagePrompt('Arte https://example.com',async()=>({ok:false})),/Não consegui ler/);
});

import {publicAddress} from './studio-reference.js';
test('Website references reject local, private and metadata addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
