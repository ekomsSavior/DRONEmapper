import test from 'node:test';
import assert from 'node:assert/strict';
import {isLiveRecord,isGhostRecord,withinTimeWindow,flightEnd,isPoliceFlight,recordTime} from '../public/activity-state.mjs';
const now=Date.parse('2026-10-22T12:00:00Z')/1000;
test('live requires a fresh position, never a just-uploaded archive or finished flight',()=>{
 const r={record_type:'position',observed_at:now-30};assert.ok(isLiveRecord(r,now));
 for(const x of [{observed_at:null},{observed_at:now+1},{observed_at:now-121},{position_conflict:true},{live:false},{source_type:'wardrive-import'},{source_type:'scanner-archive'},{record_type:'historical',status:'published-flight'},{record_type:'signal'}])assert.equal(isLiveRecord({...r,...x},now),false);
});
test('old flight records become ghosts without implying a persistent aircraft identity',()=>{
 const flight={record_type:'historical',kind:'drone',purpose:'public-safety',status:'published-flight',event_date:'2026-10-01'};
 assert.ok(isGhostRecord(flight,now));assert.ok(isPoliceFlight(flight));assert.equal('profile_id' in flight,false);
 assert.equal(isGhostRecord({...flight,event_date:'2026-10-21'},now),false);
 assert.equal(isGhostRecord({...flight,status:'historical-authorization'},now),false);
 assert.equal(isGhostRecord({...flight,event_date:'2026-02-30'},now),false);
 assert.equal(isGhostRecord({...flight,event_date:'2026-10-08'},now),false); // A date-only record ages after the complete day.
 assert.equal(isGhostRecord({profile_id:'id',last_seen:now-14*86400},now),true);
});
test('short time windows exclude date-only history, deployments and stale positions',()=>{
 for(const r of [{record_type:'activity'},{observed_at:null},{observed_at:now-86400},{status:'published-flight',event_date:'2026-10-22'}]){assert.equal(withinTimeWindow(r,1,now),false);assert.equal(withinTimeWindow(r,0,now),true);}
 assert.ok(withinTimeWindow({status:'published-flight',flight_started_at:now-600},1,now));
 assert.ok(withinTimeWindow({observed_at:now-600},1,now));
 assert.equal(flightEnd({status:'published-flight',flight_ended_at:now-1}),now-1);
});

test("flight lists sort by the original event time, newest first",()=>{const records=[{status:"published-flight",event_date:"2026-01-01"},{status:"published-flight",flight_started_at:now-60},{record_type:"activity"}];records.sort((a,b)=>recordTime(b)-recordTime(a));assert.equal(records[0].flight_started_at,now-60);assert.equal(recordTime(records[2]),0);});
