/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
import {parseWardrive,WARD_MAX_BYTES,WARD_MAX_AGE} from './wardrive-parser.mjs';
import {nodeRecord} from './node-records.mjs';
import {updateHistory} from './observation-profile.mjs';
const error=(message,status=400)=>Object.assign(Error(message),{status});
async function readUpload(request){
 const type=request.headers.get('Content-Type')||'';
 if(!/^(?:text\/csv|text\/plain|multipart\/form-data)(?:;|$)/i.test(type))throw error('Send a WiGLE CSV or multipart file field.',415);
 const length=request.headers.get('Content-Length');
 if(length!==null&&(!/^\d+$/.test(length)||+length>WARD_MAX_BYTES+16384))throw error('Upload too large.',413);
 if(!request.body)throw error('Missing CSV.');
 const reader=request.body.getReader(),parts=[];let size=0,timer;
 try{
  await Promise.race([(async()=>{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>WARD_MAX_BYTES+16384)throw error('Upload too large.',413);parts.push(value);}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('Upload timed out.',408)),10000);})]);
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
 let data=new Uint8Array(size),offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
 if(/^multipart\//i.test(type)){
  let form;try{form=await new Response(data,{headers:{'Content-Type':type}}).formData();}catch{throw error('Invalid multipart upload.');}
  const file=form.get('file');if([...form.keys()].length!==1||!file||typeof file==='string')throw error('Send one file field only.');
  if(file.size>WARD_MAX_BYTES)throw error('File exceeds 2 MiB.',413);data=new Uint8Array(await file.arrayBuffer());
 }
 if(data.length>WARD_MAX_BYTES)throw error('File exceeds 2 MiB.',413);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{throw error('CSV must use UTF-8.');}
}
export async function importWardrive(network,request,node,tokenHash,now){
 if(node.scope!=='wardrive')throw error('Use a wardrive upload token from your account.',403);
 const sql=network.ctx.storage.sql,minute=Math.floor(now/60);
 // Reserve a request before reading/parsing a file; malformed uploads count too.
 network.ctx.storage.transactionSync(()=>{
  const current=[...sql.exec('SELECT * FROM nodes WHERE token_hash=? AND revoked=0',tokenHash)][0];
  if(!current||current.scope!=='wardrive')throw error('Invalid or revoked upload token.',401);
  const count=current.minute===minute?current.requests:0;if(count>=6)throw error('Please retry shortly.',429);
  sql.exec('UPDATE nodes SET minute=?,requests=? WHERE handle=?',minute,count+1,node.handle);
 });
 const zone=request.headers.get('X-Wardrive-Timezone');if(!zone)throw error('Set X-Wardrive-Timezone to UTC or the export’s numeric UTC offset.');
 const {summary,observations}=parseWardrive(await readUpload(request),zone,now);
 const prepared=await Promise.all(observations.map(async r=>({
  event:await network.keyed('wardrive-event:'+node.handle+':'+r.identity),
  track:'signal-'+(await network.keyed('wardrive-radio:'+node.handle+':'+r.mac)).slice(0,24),raw:r
 })));
 return network.ctx.storage.transactionSync(()=>{
  if(![...sql.exec('SELECT 1 FROM nodes WHERE token_hash=? AND revoked=0 AND scope=?',tokenHash,'wardrive')].length)throw error('Invalid or revoked upload token.',401);
  sql.exec('DELETE FROM wardrive_receipts WHERE stamp<?',now-WARD_MAX_AGE);
  const fresh=prepared.filter(r=>![...sql.exec('SELECT 1 FROM wardrive_receipts WHERE event=?',r.event)].length);
  const newTracks=new Set(fresh.filter(r=>![...sql.exec('SELECT 1 FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)].length).map(r=>r.track));
  if([...sql.exec('SELECT COUNT(*) n FROM node_profiles')][0].n+newTracks.size>50000||[...sql.exec('SELECT COUNT(*) n FROM wardrive_receipts')][0].n+fresh.length>100000)throw error('Import capacity reached. Try again later.',409);
  for(const r of fresh){
   const raw={...r.raw,observation_type:'wifi-candidate',received_at:r.raw.observed_at};
   const record={...nodeRecord(raw,r.track,now),source_type:'wardrive-import',timestamp_basis:'log-first-seen',precision:'Approximate receiver area from a wardrive log; device location unknown'};
   const previous=[...sql.exec('SELECT data FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)][0];
   const prior=previous?JSON.parse(previous.data):null,history=updateHistory(prior?.sighting_history||[],record);
   const data=JSON.stringify({...((prior?.observed_at>record.observed_at)?prior:record),sighting_history:history});
   sql.exec('INSERT INTO wardrive_receipts(event,node,stamp) VALUES(?,?,?)',r.event,node.handle,record.observed_at);
   sql.exec('INSERT OR IGNORE INTO node_events(event,track,node,stamp,data) VALUES(?,?,?,?,?)',r.event,r.track,node.handle,record.observed_at,JSON.stringify(record));
   sql.exec('INSERT INTO node_profiles(track,node,first_seen,last_seen,observations,data) VALUES(?,?,?,?,1,?) ON CONFLICT(track,node) DO UPDATE SET first_seen=MIN(first_seen,excluded.first_seen),last_seen=MAX(last_seen,excluded.last_seen),observations=observations+1,data=excluded.data',r.track,node.handle,record.observed_at,record.observed_at,data);
  }
  // Uploading a historical log does not make a live receiver or live detection.
  sql.exec('UPDATE nodes SET last_seen=? WHERE handle=?',now,node.handle);
  return {schema_version:1,...summary,accepted:fresh.length,duplicates:summary.duplicates+prepared.length-fresh.length};
 });
}
