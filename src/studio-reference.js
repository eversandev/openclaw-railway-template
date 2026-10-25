import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,bits,'ipv4');
export function publicAddress(ip){const family=isIP(ip);return family===4?!blocked.check(ip,'ipv4'):family===6&&/^[23][0-9a-f]{3}:/i.test(ip);}
export async function readPublicReference(value,redirects=0){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||redirects>3)throw new Error('Unsupported reference');
 const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Private reference');
 const selected=addresses[0];
 const response=await new Promise((resolve,reject)=>{
  const request=https.get(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; ChatForgenox/1.0)','Accept':'text/html,text/plain'},lookup:(_host,options,callback)=>callback(null,options.all?[selected]:selected.address,selected.family)},res=>{
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1000000){request.destroy(new Error('Reference too large'));return}chunks.push(chunk)});res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location,type:res.headers['content-type']||'',body:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
  });request.setTimeout(12000,()=>request.destroy(new Error('Reference timeout')));request.on('error',reject);
 });
 if([301,302,303,307,308].includes(response.status)&&response.location)return readPublicReference(new URL(response.location,url).href,redirects+1);
 if(response.status!==200||!/text\/(html|plain)/i.test(response.type))throw new Error('Reference unavailable');
 const content=response.body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,12000);
 if(content.length<30)throw new Error('Reference empty');return {ok:true,outputs:[{result:{url:url.href,text:content}}]};
}
