const decode = text => text.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function extractSources(value) {
 const found=[];const seen=new Set();
 const visit=(item,depth=0)=>{if(depth>8||found.length>=5)return;
  if(Array.isArray(item)){for(const child of item)visit(child,depth+1);return;}
  if(!item||typeof item!=='object')return;
  for(const key of ['url','href','link'])if(typeof item[key]==='string'){
   try{const url=new URL(item[key]);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!seen.has(url.href)){seen.add(url.href);found.push({title:String(item.title||url.hostname).slice(0,200),url:url.href})}}catch{}
  }
  if(Array.isArray(item.citations))for(const url of item.citations)visit(typeof url==='string'?{url}:url,depth+1);
  for(const [key,child]of Object.entries(item))if(!['citations','url','href','link'].includes(key))visit(child,depth+1);
 };
 visit(value);return found;
}
export function parseSearchHtml(html) {
 const results=[];
 const pattern=/<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
 for(const match of html.matchAll(pattern)){
  const href=match[1].match(/href=["']([^"']+)["']/i)?.[1];if(!href)continue;
  try{let url=new URL(decode(href),'https://duckduckgo.com');if(url.searchParams.has('uddg'))url=new URL(url.searchParams.get('uddg'));if(!['http:','https:'].includes(url.protocol)||url.hostname.endsWith('duckduckgo.com'))continue;
   const nearby=html.slice(match.index+match[0].length,match.index+match[0].length+2500);const snippet=nearby.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i)?.[1]||'';
   results.push({title:decode(match[2]),url:url.href,snippet:decode(snippet).slice(0,1200)});if(results.length>=5)break;
  }catch{}
 }
 return results;
}
export async function searchStudioWeb(query, { runCli, fetcher=fetch }={}) {
 const finish=async result=>{
  const pages=await Promise.all(result.sources.slice(0,2).map(async source=>{
   try{const page=await runCli(['infer','web','fetch','--url',source.url,'--json'],25000);if(page.ok)return {url:source.url,content:JSON.stringify(page.outputs?.[0]?.result||{}).slice(0,14000)};}catch{}
   return null;
  }));
  result.pages=pages.filter(Boolean);return result;
 };
 const clean=String(query).trim().slice(0,400);if(!clean)throw new Error('Empty search');
 for(const provider of [null,'duckduckgo']){
  try{const args=['infer','web','search','--query',clean,'--limit','5','--json'];if(provider)args.push('--provider',provider);
   const envelope=await runCli(args,45000);const data=envelope.outputs?.[0]?.result;const sources=extractSources(data);
   if(envelope.ok&&sources.length)return finish({query:clean,checkedAt:new Date().toISOString(),sources,data:JSON.stringify(data).slice(0,18000)});
  }catch{}
 }
 // Key-free fallback when the installed gateway has no configured search provider.
 const url=new URL('https://html.duckduckgo.com/html/');url.searchParams.set('q',clean);
 const response=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; ChatForgenox/1.0)'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Search unavailable');
 const html=await response.text();if(html.length>2000000)throw new Error('Search response too large');
 const results=parseSearchHtml(html);if(!results.length)throw new Error('No verifiable results');
 return finish({query:clean,checkedAt:new Date().toISOString(),sources:results.map(({title,url})=>({title,url})),data:JSON.stringify(results)});
}
