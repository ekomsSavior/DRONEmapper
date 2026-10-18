/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
import {updateHistory} from './observation-profile.mjs';
import {DurableObject} from 'cloudflare:workers';
import {UUID,envelope,validateBatch,nodeRecord,nodeIdentity,mergeNodeRows,RETENTION} from './node-records.mjs';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
export async function boundedJson(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw Object.assign(Error('Send JSON'),{status:415});
 const claimed=request.headers.get('Content-Length');
 if(claimed!==null&&(!/^\d+$/.test(claimed)||Number(claimed)>65536))throw Object.assign(Error('Body too large'),{status:413});
 if(!request.body)throw Object.assign(Error('Missing body'),{status:400});
 const reader=request.body.getReader(),chunks=[];let size=0,timer;
 try{
  const read=async()=>{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Object.assign(Error('Body too large'),{status:413});chunks.push(value);}};
  await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Request timed out'),{status:408})),5000);})]);
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}
export class NodeNetwork extends DurableObject{
 constructor(ctx,env){
  super(ctx,env);this.budget={minute:0,count:0};this.pruned=0;
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS nodes (handle TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, client_id TEXT, created REAL NOT NULL, last_seen REAL NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, minute INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0)');
  const columns=[...ctx.storage.sql.exec('PRAGMA table_info(nodes)')].map(c=>c.name);
  if(!columns.includes('owner'))ctx.storage.sql.exec("ALTER TABLE nodes ADD COLUMN owner TEXT");
  if(!columns.includes('label'))ctx.storage.sql.exec("ALTER TABLE nodes ADD COLUMN label TEXT");
  if(!columns.includes('flow'))ctx.storage.sql.exec("ALTER TABLE nodes ADD COLUMN flow TEXT");
  ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS nodes_owner ON nodes(owner)');
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS account_names(owner TEXT PRIMARY KEY,name TEXT NOT NULL)');
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS node_events (event TEXT PRIMARY KEY, track TEXT NOT NULL, node TEXT NOT NULL, stamp REAL NOT NULL, data TEXT NOT NULL)');
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS node_profiles (track TEXT NOT NULL, node TEXT NOT NULL, first_seen REAL NOT NULL, last_seen REAL NOT NULL, observations INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(track,node))');
  ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS node_events_stamp ON node_events(stamp)');
  ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS node_events_node ON node_events(node)');
  ctx.blockConcurrencyWhile(async()=>{
   let secret=await ctx.storage.get('identity-secret');if(!secret){secret=random();await ctx.storage.put('identity-secret',secret);}
   this.secret=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  });
 }
 async keyed(value){return hex(await crypto.subtle.sign('HMAC',this.secret,encoder.encode(value)));}
 prune(now){
  if(now-this.pruned<60)return;this.pruned=now;
  this.ctx.storage.sql.exec('DELETE FROM node_events WHERE stamp<?',now-RETENTION);
  this.ctx.storage.sql.exec('DELETE FROM node_events WHERE event IN (SELECT event FROM node_events ORDER BY stamp DESC LIMIT -1 OFFSET 50000)');
 }
 async alarm(){this.prune(Date.now()/1000);if([...this.ctx.storage.sql.exec('SELECT 1 FROM node_events LIMIT 1')].length)await this.ctx.storage.setAlarm(Date.now()+300000);}
 async snapshot(hours=24){
  const now=Date.now()/1000;this.prune(now);
  const rows=[...this.ctx.storage.sql.exec('SELECT p.track,p.node,p.data,p.first_seen,p.observations,n.last_seen,a.name AS contributor FROM node_profiles p JOIN nodes n ON n.handle=p.node LEFT JOIN account_names a ON a.owner=n.owner WHERE n.revoked=0 AND (?=0 OR p.last_seen>=?) ORDER BY p.last_seen,p.track',hours,now-hours*3600)];
  const names=new Map();for(const row of rows){if(row.contributor){if(!names.has(row.track))names.set(row.track,new Set());names.get(row.track).add(row.contributor);}}
  const records=mergeNodeRows(rows,now);
  for(const record of records){
   record.ghost=now-record.last_seen>=14*86400;
   record.profile_id=record.id;
   record.contributors=[...(names.get(record.id)||[])].sort().slice(0,10);
   record.identity_basis=record.record_type==='signal'?'Same radio address reported by the same node; device identity unconfirmed':'Same broadcast ID; identity unverified';
   const events=this.ctx.storage.sql.exec('SELECT data FROM node_events WHERE track=? ORDER BY stamp,event',record.id);
   const history=mergeNodeRows([...events].map(e=>({node:'trail',last_seen:0,data:e.data})),now)[0];
   if(history?.position_conflict)record.position_conflict=true;
   record.trail=record.position_conflict?[]:(history?.trail||[]);
   if(record.position_conflict)record.live=false;
  }
  const tracks=records.filter(r=>r.record_type==='position'),signals=records.filter(r=>r.record_type==='signal');
  const active=[...this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM nodes WHERE revoked=0 AND last_seen>=?',now-120)][0].n;
  return {tracks,signals,nodes:{enabled:true,active_nodes:active,positions:tracks.length,signals:signals.length,retention_seconds:RETENTION,ghost_after_days:14,ghosts:records.filter(r=>r.ghost).length}};
 }
 async connectAccount(owner,client,label,flow,allowRotate=true){
  if(typeof owner!=='string'||owner.length>128||!UUID.test(client)||!UUID.test(flow))throw Error('Invalid account connection');
  const token=await this.keyed('account-credential:'+owner+':'+client+':'+flow),digest=await hash(token),now=Date.now()/1000;
  return this.ctx.storage.transactionSync(()=>{
   if([...this.ctx.storage.sql.exec('SELECT 1 FROM nodes WHERE owner=? AND client_id=? AND flow=? AND revoked=1',owner,client,flow)].length)throw Error('Connection expired');
   const prior=[...this.ctx.storage.sql.exec('SELECT handle,flow FROM nodes WHERE owner=? AND client_id=? AND revoked=0',owner,client)][0];
   if(!allowRotate&&(!prior||prior.flow!==flow))throw Error('Connection expired');
   if(prior){
    if(prior.flow!==flow)this.ctx.storage.sql.exec('UPDATE nodes SET token_hash=?,flow=?,label=? WHERE handle=?',digest,flow,label,prior.handle);
    return {node_handle:prior.handle,node_key:token};
   }
   if([...this.ctx.storage.sql.exec('SELECT COUNT(*) n FROM nodes WHERE owner=? AND revoked=0',owner)][0].n>=10||[...this.ctx.storage.sql.exec('SELECT COUNT(*) n FROM nodes')][0].n>=5000)throw Error('Unable to connect another node');
   const handle=crypto.randomUUID();
   this.ctx.storage.sql.exec('INSERT INTO nodes(handle,token_hash,client_id,created,owner,label,flow) VALUES(?,?,?,?,?,?,?)',handle,digest,client,now,owner,label,flow);
   return {node_handle:handle,node_key:token};
  });
 }
 async setAccountProfile(owner,name){this.ctx.storage.sql.exec('INSERT INTO account_names(owner,name) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name',owner,name);}
 async accountNodes(owner){return [...this.ctx.storage.sql.exec('SELECT handle,label,created,last_seen FROM nodes WHERE owner=? AND revoked=0 ORDER BY created',owner)].map(r=>({...r,online:Date.now()/1000-r.last_seen<120}));}
 async revokeAccountNode(owner,handle){
  this.ctx.storage.transactionSync(()=>{
   if(![...this.ctx.storage.sql.exec('SELECT 1 FROM nodes WHERE owner=? AND handle=?',owner,handle)].length)return;
   this.ctx.storage.sql.exec('UPDATE nodes SET revoked=1 WHERE handle=?',handle);
   this.ctx.storage.sql.exec('DELETE FROM node_events WHERE node=?',handle);
   this.ctx.storage.sql.exec('DELETE FROM node_profiles WHERE node=?',handle);
  });
 }
 async fetch(request){
  const path=new URL(request.url).pathname,now=Date.now()/1000;
  if(this.env.NODE_INGEST_ENABLED!=='true')return reply({error:'Node contributions are not enabled'},503);
  if(request.method!=='POST')return reply({error:'POST required'},405);
  if(request.headers.has('Origin'))return reply({error:'Use the node client'},403);
  const minute=Math.floor(now/60);if(this.budget.minute!==minute)this.budget={minute,count:0};
  if(++this.budget.count>1200)return reply({error:'Node service busy; retry shortly'},429);
  const auth=request.headers.get('Authorization')||'',admin=path.startsWith('/v1/admin/');
  if(admin){
   if(!this.env.NODE_ADMIN_TOKEN||this.env.NODE_ADMIN_TOKEN.length<32)return reply({error:'Node administration is not configured'},503);
   if(await hash(auth)!==await hash('Bearer '+this.env.NODE_ADMIN_TOKEN))return reply({error:'Unauthorized'},401);
  }
  let tokenHash,node;
  if(!admin){
   if(!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(auth))return reply({error:'Invalid node key'},401);
   tokenHash=await hash(auth.slice(7));node=[...this.ctx.storage.sql.exec('SELECT * FROM nodes WHERE token_hash=?',tokenHash)][0];
   if(!node||node.revoked)return reply({error:'Invalid or revoked node key'},401);
  }
  let body;try{body=await boundedJson(request);}catch(e){return reply({error:e.message},e.status||400);}
  if(admin){
   if(path==='/v1/admin/nodes'){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return reply({error:'Expected empty JSON object'},422);
    if([...this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM nodes')][0].n>=5000)return reply({error:'Node enrollment capacity reached'},409);
    const handle=crypto.randomUUID(),token=random(),digest=await hash(token);
    this.ctx.storage.sql.exec('INSERT INTO nodes(handle,token_hash,created) VALUES(?,?,?)',handle,digest,now);
    return reply({schema_version:1,node_handle:handle,node_key:token},201);
   }
   if(path==='/v1/admin/revoke'){
    if(!body||Object.keys(body).length!==1||!UUID.test(body.node_handle))return reply({error:'Invalid node handle'},422);
    this.ctx.storage.transactionSync(()=>{this.ctx.storage.sql.exec('UPDATE nodes SET revoked=1 WHERE handle=?',body.node_handle);this.ctx.storage.sql.exec('DELETE FROM node_events WHERE node=?',body.node_handle);this.ctx.storage.sql.exec('DELETE FROM node_profiles WHERE node=?',body.node_handle);});
    return reply({revoked:true});
   }
   return reply({error:'Not found'},404);
  }
  let records;
  try{if(path==='/v1/nodes/heartbeat')envelope(body,false);else if(path==='/v1/observations')records=validateBatch(body,now);else return reply({error:'Not found'},404);}
  catch{return reply({error:'Invalid or expired observation batch'},422);}
  const prepared=records?await Promise.all(records.map(async raw=>{const [prefix,key]=nodeIdentity(raw,node.handle);return {event:await this.keyed('event:'+node.handle+':'+raw.event_id),track:prefix+(await this.keyed(key)).slice(0,24),raw};})):[];
  // Authentication, binding and rate state are re-read after asynchronous work.
  const result=this.ctx.storage.transactionSync(()=>{
   const current=[...this.ctx.storage.sql.exec('SELECT * FROM nodes WHERE token_hash=?',tokenHash)][0];
   if(!current||current.revoked)return {status:401,error:'Invalid or revoked node key'};
   if(current.client_id&&current.client_id!==body.node_id)return {status:403,error:'This key belongs to another node'};
   const count=current.minute===minute?current.requests:0;if(count>=60)return {status:429,error:'Node rate limit reached'};
   this.ctx.storage.sql.exec('UPDATE nodes SET client_id=?,last_seen=?,minute=?,requests=? WHERE handle=?',body.node_id,now,minute,count+1,node.handle);
   let accepted=0;
   const newTracks=new Set(prepared.filter(r=>![...this.ctx.storage.sql.exec('SELECT 1 FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)].length).map(r=>r.track));
   if([...this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM node_profiles')][0].n+newTracks.size>50000)return {status:409,error:'Profile capacity reached'};
   for(const r of prepared){
    const prior=[...this.ctx.storage.sql.exec('SELECT data FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)][0];
    const record=nodeRecord(r.raw,r.track,now);record.sighting_history=updateHistory(prior?JSON.parse(prior.data).sighting_history:[],record);
    const data=JSON.stringify(record),stamp=r.raw.observed_at;
    const added=[...this.ctx.storage.sql.exec('INSERT OR IGNORE INTO node_events(event,track,node,stamp,data) VALUES(?,?,?,?,?) RETURNING event',r.event,r.track,node.handle,stamp,data)].length;
    accepted+=added;
    if(added)this.ctx.storage.sql.exec('INSERT INTO node_profiles(track,node,first_seen,last_seen,observations,data) VALUES(?,?,?,?,1,?) ON CONFLICT(track,node) DO UPDATE SET first_seen=MIN(first_seen,excluded.first_seen),data=CASE WHEN excluded.last_seen>=last_seen THEN excluded.data ELSE data END,last_seen=MAX(last_seen,excluded.last_seen),observations=observations+1',r.track,node.handle,stamp,stamp,data);
   }
   return {status:200,body:records?{schema_version:1,accepted,duplicates:records.length-accepted}:{schema_version:1,ok:true}};
  });
  if(result.error)return reply({error:result.error},result.status);
  this.prune(now);if(prepared.length&&!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+300000);
  if(!records&&node.owner&&this.env.AUTH_DB){const profile=await this.env.AUTH_DB.prepare('SELECT name FROM user WHERE id=?').bind(node.owner).first();result.body.display_name=profile?.name||'Anonymous';}
  return reply(result.body);
 }
}
export function nodeRequestAllowed(request,env){
 const u=new URL(request.url);return u.protocol==='https:'||env.NODE_ALLOW_LOCAL_HTTP==='true'&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);
}
