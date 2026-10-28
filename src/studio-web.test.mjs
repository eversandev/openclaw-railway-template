import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSources,parseSearchHtml,searchStudioWeb} from './studio-web.js';
test('Web sources accept only ordinary web links and deduplicate them',()=>{
 assert.deepEqual(extractSources({results:[{title:'Fonte',url:'https://example.com/a'},{url:'javascript:alert(1)'},{url:'https://example.com/a'}]}),[{title:'Fonte',url:'https://example.com/a'}]);
});
test('HTML fallback extracts real result links rather than search redirects',()=>{
 const html='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fweather">Tempo &amp; clima</a><a class="result__snippet">Previsão atualizada</a>';
 assert.deepEqual(parseSearchHtml(html),[{title:'Tempo & clima',url:'https://example.com/weather',snippet:'Previsão atualizada'}]);
});
test('Search uses the configured CLI and preserves verified citations',async()=>{
 const result=await searchStudioWeb('clima São Paulo hoje',{runCli:async args=>{assert.equal(args[4],'clima São Paulo hoje');return {ok:true,outputs:[{result:{results:[{title:'Tempo',url:'https://example.com',snippet:'20°C'}]}}]}}});
 assert.equal(result.sources[0].url,'https://example.com/');assert.match(result.data,/20°C/);
});
test('Unavailable providers fall back without granting arbitrary network tools',async()=>{
 let called=0;
 const result=await searchStudioWeb('teste',{runCli:async()=>{throw new Error('No provider')},fetcher:async url=>{called++;assert.equal(url.hostname,'html.duckduckgo.com');return new Response('<a href="https://example.com" class="result__a">Exemplo</a>')}});
 assert.equal(called,1);assert.equal(result.sources[0].url,'https://example.com/');
 await assert.rejects(searchStudioWeb('teste',{runCli:async()=>{throw new Error('No provider')},fetcher:async()=>new Response('No results')}));
});
