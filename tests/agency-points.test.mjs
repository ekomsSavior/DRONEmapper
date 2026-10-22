import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {agencies,fetchAgencyFlights} from '../worker/agency-flights.mjs';
import {durationMinutes,normalizeOperationPoints,pointRevision} from '../worker/agency-points.mjs';
import {isLiveRecord,isGhostRecord} from '../public/activity-state.mjs';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/roselle-operations.json',import.meta.url))),a=agencies.find(a=>a.id==='roselle');
test('real deployment log keeps calendar days and generalized areas, never a live position',()=>{
 const records=normalizeOperationPoints(f.features,a,f.now);assert.equal(records.length,3);
 const r=records[0];assert.equal(r.flight_started_at,undefined);assert.equal(r.observed_at,null);assert.equal(isLiveRecord(r,f.now),false);assert.equal(isGhostRecord(r,f.now),true);
 assert.equal(r.event_date,new Date(f.features[0].attributes.USER_Date_).toISOString().slice(0,10));
 assert.ok(r.flight_area[2]-r.flight_area[0]>.0099);assert.ok(r.flight_area[3]-r.flight_area[1]>.0099);
 assert.equal(r.USER_Address,undefined);assert.equal(r.USER_Case___,undefined);
});
test('dates must agree, coordinates must be valid, and row identities cannot repeat',()=>{
 for(const change of [x=>x.attributes.Date_Text='2/30/2026',x=>x.attributes.USER_Date_=(f.now+86400)*1000,x=>x.geometry.x=180,x=>x.geometry.y=91,x=>x.geometry=null]){const x=structuredClone(f.features[0]);change(x);assert.equal(normalizeOperationPoints([x],a,f.now).length,0);}
 assert.throws(()=>normalizeOperationPoints([f.features[0],f.features[0]],a,f.now),/identifier/);
 assert.equal(durationMinutes('1 hour 30 mins'),90);assert.equal(durationMinutes('2 hours'),120);assert.equal(durationMinutes('50 Min'),50);
 for(const bad of ['about 20','-5 min','3 min plus training','999 hours',null])assert.equal(durationMinutes(bad),null);
});
test('point collector validates complete pages and revision, minimizes fields and reuses unchanged data',async()=>{
 const calls=[];const fetch=async url=>{const u=new URL(url);calls.push(u);return !u.pathname.endsWith('/query')?f.metadata:u.searchParams.has('returnCountOnly')?{count:3}:{spatialReference:{wkid:4326},features:f.features};};
 const result=await fetchAgencyFlights(fetch,a,{},f.now);assert.equal(result.records.length,3);
 assert.equal(calls.find(u=>u.searchParams.has('outFields')).searchParams.get('outFields'),'OBJECTID,Date_Text,USER_Date_,USER_Total_Duration_of_Flight,General_Category');
 calls.length=0;assert.equal((await fetchAgencyFlights(fetch,a,result,f.now)).records,result.records);assert.equal(calls.length,1);
 await assert.rejects(()=>fetchAgencyFlights(async u=>{const r=await fetch(u);return r.features?{...r,features:[]}:r;},a,{},f.now),/Incomplete/);
 let n=0;await assert.rejects(()=>fetchAgencyFlights(async u=>{const r=await fetch(u);return r.editingInfo?{...r,editingInfo:{lastEditDate:++n}}:r;},a,{},f.now),/changed during/);
 assert.throws(()=>pointRevision({...f.metadata,dateFieldsTimeReference:{timeZone:'America/Chicago'}}),/schema/);
});
