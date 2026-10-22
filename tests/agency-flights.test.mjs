import test from 'node:test';
import assert from 'node:assert/strict';
import {agencies,layerRevision,normalizeAgencyFlights,fetchAgencyFlights} from '../worker/agency-flights.mjs';
import {isLiveRecord as isLive,isGhostRecord as isGhost} from '../public/activity-state.mjs';
const now=Date.parse('2026-10-22T12:00:00Z')/1000,a=agencies[0];
const meta=()=>({geometryType:'esriGeometryPolyline',objectIdField:'ObjectId',extent:{spatialReference:{wkid:4326}},advancedQueryCapabilities:{supportsReturningGeometryEnvelope:true},editingInfo:{lastEditDate:1},fields:Object.entries({ObjectId:'OID',flight_id:'String',takeoff:'Date',landing:'Date',flight_purpose:'String'}).map(([name,type])=>({name,type:'esriFieldType'+type}))});
const feature=(id=1)=>({attributes:{ObjectId:id,flight_id:'12345678-abcd-abcd-abcd-'+String(id).padStart(12,'0'),takeoff:(now-600)*1000,landing:(now-60)*1000,flight_purpose:'Search and rescue'},envelope:{xmin:-84.5102,ymin:39.1001,xmax:-84.5013,ymax:39.1108}});
test('published completed missions retain timing, department, reason and generalized envelope, never live',()=>{
 const [r]=normalizeAgencyFlights([feature()],a,now);
 assert.equal(r.flight_started_at,now-600);assert.equal(r.reported_duration_minutes,9);assert.equal(r.operator,a.agency);assert.equal(r.flight_purpose,'Search and rescue');assert.deepEqual(r.flight_area,[39.1,-84.511,39.111,-84.501]);assert.equal(r.live,false);assert.equal(r.observed_at,null);assert.equal(isLive(r,now),false);assert.equal(isGhost(r,now),false);assert.equal(isGhost(r,now+14*86400),true);
});
test('duplicate source rows collapse; inconsistent copies are excluded, repeated page IDs fail',()=>{
 const f=feature(),copy=structuredClone(f);copy.attributes.ObjectId=2;
 assert.equal(normalizeAgencyFlights([f,copy],a,now).length,1);
 copy.attributes.flight_purpose='Conflicting report';assert.equal(normalizeAgencyFlights([f,copy],a,now).length,0);
 assert.throws(()=>normalizeAgencyFlights([f,f],a,now),/identifier/);
});
test('invalid dates and envelopes cannot create a map point',()=>{
 for(const change of [f=>f.envelope.xmin=0,f=>f.envelope.ymin='39',f=>f.attributes.landing=(now+60)*1000,f=>f.attributes.takeoff=null,f=>f.envelope=null]){const f=feature();change(f);assert.equal(normalizeAgencyFlights([f],a,now).length,0);}
 assert.equal(normalizeAgencyFlights([feature()],{...a,window_days:0.0001},now).length,0);
});
test('complete bounded pagination, schema and revision validation',async()=>{
 const features=Array.from({length:1002},(_,i)=>feature(i+1)),calls=[];
 const fetch=async url=>{const u=new URL(url);calls.push(u);if(!u.pathname.endsWith('/query'))return meta();if(u.searchParams.has('returnCountOnly'))return {count:1002};const start=+u.searchParams.get('resultOffset'),size=+u.searchParams.get('resultRecordCount');return {spatialReference:{wkid:4326},features:features.slice(start,start+size)};};
 const r=await fetchAgencyFlights(fetch,a,{},now);assert.equal(r.records.length,1002);assert.equal(r.coverage.selected_rows,1002);assert.equal(calls.length,5);
 assert.ok(calls.filter(u=>u.searchParams.has('outFields')).every(u=>u.searchParams.get('returnGeometry')==='false'&&u.searchParams.get('returnEnvelope')==='true'));
 calls.length=0;assert.equal((await fetchAgencyFlights(fetch,a,r,now)).records,r.records);assert.equal(calls.length,1);
 let pages=0;await assert.rejects(()=>fetchAgencyFlights(async u=>{const r=await fetch(u);if(r.features&&++pages===2)r.features=[];return r;},a,{},now),/Incomplete/);
 let m=0;await assert.rejects(()=>fetchAgencyFlights(async u=>{const r=await fetch(u);if(r.editingInfo)r.editingInfo.lastEditDate=++m;return r;},a,{},now),/changed during/);
 const bad=meta();bad.fields=[];assert.throws(()=>layerRevision(bad),/fields changed/);
});
test('bounded windows report omitted rows without claiming complete history',async()=>{
 const r=await fetchAgencyFlights(async u=>u.includes('returnCountOnly')?{count:10}:u.includes('/query?')?{spatialReference:{wkid:4326},features:[feature()]}:meta(),{...a,max_records:1},{},now);assert.equal(r.coverage.omitted_rows,9);assert.equal(r.records.length,1);
});
test('coverage distinguishes configured feeds, successful records and delayed updates',async()=>{
 const {policeCoverage}=await import('../worker/police-coverage.mjs');
 const result=policeCoverage({['police-'+a.id]:{records:normalizeAgencyFlights([feature()],a,now),last_success:now-30,last_attempt:now,error:'Unavailable'},atlas:{records:[{},{}]}},now);
 assert.equal(result.configured_flight_feeds,agencies.length+1);assert.equal(result.feeds_with_records,1);assert.equal(result.mapped_flights,1);assert.equal(result.documented_program_records,2);assert.equal(result.feeds.find(f=>f.id==='police-'+a.id).status,'delayed');
 assert.ok(result.feeds.some(f=>f.status==='pending'));
});
