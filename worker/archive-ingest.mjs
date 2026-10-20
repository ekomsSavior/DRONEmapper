/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
import {validateBatch,nodeIdentity,nodeRecord} from './node-records.mjs';
import {updateHistory} from './observation-profile.mjs';
export const ARCHIVE_AGE=365*86400;
export async function importArchive(network,body,node,tokenHash,now){
 let observations;try{observations=validateBatch(body,now,ARCHIVE_AGE);}catch(e){throw Object.assign(e,{status:422});}
 const sql=network.ctx.storage.sql;
 const prepared=await Promise.all(observations.map(async raw=>{
  const [prefix,key]=nodeIdentity(raw,node.handle);
  return {raw,event:await network.keyed('event:'+node.handle+':'+raw.event_id),track:prefix+(await network.keyed(key)).slice(0,24)};
 }));
 const reject=(message,status)=>{throw Object.assign(Error(message),{status});};
 return network.ctx.storage.transactionSync(()=>{
  const current=[...sql.exec("SELECT * FROM nodes WHERE token_hash=? AND revoked=0 AND scope='scanner'",tokenHash)][0];
  if(!current)reject('Invalid scanner key',401);
  if(current.client_id&&current.client_id!==body.node_id)reject('This key belongs to another node',403);
  const minute=Math.floor(now/60),count=current.minute===minute?current.requests:0;
  if(count>=60)reject('Please retry shortly.',429);
  sql.exec('DELETE FROM archive_receipts WHERE stamp<?',now-ARCHIVE_AGE);
  const fresh=prepared.filter(r=>![...sql.exec('SELECT 1 FROM archive_receipts WHERE event=?',r.event)].length&&![...sql.exec('SELECT 1 FROM node_events WHERE event=?',r.event)].length);
  const newTracks=new Set(fresh.filter(r=>![...sql.exec('SELECT 1 FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)].length).map(r=>r.track));
  if([...sql.exec('SELECT COUNT(*) n FROM node_profiles')][0].n+newTracks.size>50000||[...sql.exec('SELECT COUNT(*) n FROM archive_receipts')][0].n+prepared.length>100000)reject('Import capacity reached. Try again later.',409);
  for(const r of fresh){
   const record={...nodeRecord(r.raw,r.track,now),source_type:'scanner-archive'};
   const priorRow=[...sql.exec('SELECT data FROM node_profiles WHERE track=? AND node=?',r.track,node.handle)][0];
   const prior=priorRow?JSON.parse(priorRow.data):null;
   const data=JSON.stringify({...((prior?.observed_at>record.observed_at)?prior:record),sighting_history:updateHistory(prior?.sighting_history||[],record)});
   sql.exec('INSERT OR IGNORE INTO node_events(event,track,node,stamp,data) VALUES(?,?,?,?,?)',r.event,r.track,node.handle,record.observed_at,JSON.stringify(record));
   sql.exec('INSERT INTO node_profiles(track,node,first_seen,last_seen,observations,data) VALUES(?,?,?,?,1,?) ON CONFLICT(track,node) DO UPDATE SET first_seen=MIN(first_seen,excluded.first_seen),last_seen=MAX(last_seen,excluded.last_seen),observations=observations+1,data=excluded.data',r.track,node.handle,record.observed_at,record.observed_at,data);
  }
  for(const r of prepared)sql.exec('INSERT OR IGNORE INTO archive_receipts(event,node,stamp) VALUES(?,?,?)',r.event,node.handle,r.raw.observed_at);
  // A saved trip is not a currently listening receiver.
  sql.exec('UPDATE nodes SET client_id=?,minute=?,requests=? WHERE handle=?',body.node_id,minute,count+1,node.handle);
  return {schema_version:1,accepted:fresh.length,duplicates:prepared.length-fresh.length};
 });
}
