
import {scrypt, randomBytes, timingSafeEqual, createHmac} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const GENERIC='Unable to complete this request. Please try again later.';
export function emailAddress(value){return typeof value==='string'?value.trim().toLowerCase():'';}
export function strongPassword(value){
 if(typeof value!=='string'||[...value].length<15||[...value].length>128||new TextEncoder().encode(value).length>512)return false;
 const compact=value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 if(/^(?:password|qwerty|1234567890|dronemapper|churchofmalware|saviorsec)+\d*$/.test(compact))return false;
 if(/^(.)\1+$/.test(value)||/^(password|qwerty|123456|letmein|dronemapper|churchofmalware|saviorsec)[0-9!@#$%^&*]*$/i.test(value))return false;
 return new Set(compact).size>=7;
}
export async function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 const key=await derive(password.normalize('NFKC'),salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return 'scrypt:32768:8:3:'+salt+':'+key.toString('hex');
}
export async function verifyPassword({hash,password}){
 const match=/^scrypt:32768:8:3:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash||'');
 if(!match)return false;
 const key=await derive(password.normalize('NFKC'),match[1],64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return timingSafeEqual(key,Buffer.from(match[2],'hex'));
}
export function privateHash(secret,kind,value){return createHmac('sha256',secret).update(kind+':'+value).digest('hex');}
export function clientIP(request,local=false){
 const value=local?(request.headers.get('X-Test-IP')||'127.0.0.1'):request.headers.get('CF-Connecting-IP');
 if(!value||value.length>64)return null;
 try {return value.includes(':')?new URL('https://['+value+']/').hostname.slice(1,-1):/^(\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every(n=>+n<256)?value.split('.').map(Number).join('.'):null;}catch{return null;}
}
export function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export async function smallBody(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw Error('json');
 const reader=request.body?.getReader();if(!reader)throw Error('body');
 let size=0,parts=[],timer;
 try{
  await Promise.race([(async()=>{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('size');parts.push(value);}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),5000);})]);
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('object');return body;
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}

export function displayName(value){if(typeof value!=='string')return 'Anonymous';const n=value.normalize('NFKC').trim().replace(/ +/g,' ');if(!n)return 'Anonymous';if(n.length>32||!/^[\p{L}\p{N} _.-]+$/u.test(n))return null;return n;}
