import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSFPD,fetchSFPD,flightDate,SFPD_META} from '../worker/police-flights.mjs';
import {policePortalFor} from '../public/police-portals.mjs';
import {mergePositions,publicRecord} from '../worker/sources.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sfpd-flight-logs.json',import.meta.url)));
const rows=()=>structuredClone(fixture.rows),meta=()=>structuredClone(fixture.metadata);
const TODAY='2026-10-21';
test('published logs retain flight day and duration without becoming live positions',()=>{
 const [r]=normalizeSFPD(rows(),TODAY);assert.equal(r.record_type,'historical');assert.equal(r.observed_at,null);assert.equal(r.event_date,'2026-04-07');assert.equal(r.publication_date,'2026-09-25');assert.equal(r.reported_duration_minutes,3);assert.equal(r.latitude,37.773864);assert.equal(r.longitude,-122.405301);assert.equal(r.model,null);assert.equal(r.manufacturer,null);assert.equal(mergePositions([], [r])[0].trail,undefined);assert.equal(publicRecord(r).source_url,undefined);
});
test('unknown locations, invalid/future dates and swapped or coerced coordinates never map',()=>{
 for(const patch of [{point:null},{point:{type:'Point',coordinates:[37.7,-122.4]}},{point:{type:'Point',coordinates:['-122.4',37.7]}},{point:{type:'Point',coordinates:[-122.4,true]}},{point:{type:'Point',coordinates:[0,0]}},{date:'2026-02-30'},{date:'2027-01-01'},{date:'2026-04-07Z'}])assert.deepEqual(normalizeSFPD([{...rows()[0],...patch}],TODAY),[]);
 assert.equal(flightDate('2024-05-15',TODAY),null);
});
test('case identifiers, addresses, narratives and arbitrary mission text are excluded',()=>{
 const [r]=normalizeSFPD([{...rows()[0],case_cad_event_number:'sensitive',location:'private',call_type_original_desc:'private',user_email:'private',reason_for_flight:'Named person at private address',flight_duration_minutes:true}],TODAY);
 assert.equal(r.flight_purpose,'Other / unspecified');assert.equal(r.reported_duration_minutes,null);assert.ok(!JSON.stringify(r).includes('private'));assert.ok(!JSON.stringify(r).includes('sensitive'));
 assert.equal(normalizeSFPD([{...rows()[0],reason_for_flight:'Fire / Mutual Aid'}],TODAY)[0].flight_purpose,'Fire/Mutual Aid');
});
test('row identity preserves separate flights and rejects missing or duplicate identifiers',()=>{
 const p=rows()[0];assert.equal(normalizeSFPD([p,{...p,source_row_id:'different'}],TODAY).length,2);assert.throws(()=>normalizeSFPD([p,p],TODAY));assert.throws(()=>normalizeSFPD([{...p,source_row_id:null}],TODAY));assert.throws(()=>normalizeSFPD({error:'bad'}));
});
test('paged collection selects only needed fields and checks schema, license and revision',async()=>{
 const urls=[];const r=await fetchSFPD(async url=>{urls.push(url);return url===SFPD_META?meta():rows();});assert.equal(r.records.length,2);assert.equal(r.refresh_after,3600);const q=new URL(urls[1]).searchParams;assert.equal(q.get('$order'),':id');assert.ok(q.get('$select').includes(':id as source_row_id'));assert.ok(!q.get('$select').includes('case_cad'));
 for(const bad of [{...meta(),licenseId:'changed'},{...meta(),columns:[]}])await assert.rejects(fetchSFPD(async()=>bad));
 let n=0;await assert.rejects(fetchSFPD(async url=>url===SFPD_META?{...meta(),rowsUpdatedAt:meta().rowsUpdatedAt+n++}:rows()),/changed during/);
 await assert.rejects(fetchSFPD(async url=>url===SFPD_META?meta():[{...rows()[0],point:null}]),/No usable/);
});
test('repeated pages and mid-page failure cannot silently replace the previous dataset',async()=>{
 const full=Array.from({length:2000},(_,i)=>({...rows()[0],source_row_id:'test-'+i}));
 await assert.rejects(fetchSFPD(async url=>url===SFPD_META?meta():full),/pagination/);
 let n=0;await assert.rejects(fetchSFPD(async url=>{if(url===SFPD_META)return meta();if(n++)throw Error('Unavailable');return full;}),/Unavailable/);
});
test('agency portal matching requires operator, drone type and region together',()=>{
 const [r]=normalizeSFPD(rows(),TODAY);assert.equal(policePortalFor(r).id,'san-francisco');assert.equal(policePortalFor({...r,operator:'Unknown'}),null);assert.equal(policePortalFor({...r,latitude:48}),null);assert.equal(policePortalFor({...r,kind:'autonomous-vehicle'}),null);
});

test('every reviewed portal has matching static links and a unique agency-region match',async()=>{
 const {policePortals}=await import('../public/police-portals.mjs');
 const html=readFileSync(new URL('../public/police-flights.html',import.meta.url),'utf8');
 assert.equal(new Set(policePortals.map(p=>p.id)).size,policePortals.length);
 for(const p of policePortals){assert.equal(new URL(p.url).protocol,'https:');assert.equal(new URL(p.official).protocol,'https:');assert.ok(html.includes('id="'+p.id+'"'));assert.ok(html.includes(p.url));const [south,west,north,east]=p.bounds;assert.equal(policePortalFor({operator:p.aliases[0],purpose:'public-safety',kind:'drone',latitude:(south+north)/2,longitude:(west+east)/2})?.id,p.id);}
});

test('five-minute cron respects hourly publications and retry deadlines',async()=>{
 const {collectionDue}=await import('../worker/sources.mjs');
 assert.equal(collectionDue({next_attempt:4600,refresh_after:3600},true,1300),false);
 assert.equal(collectionDue({next_attempt:4600,refresh_after:3600},true,4600),true);
 assert.equal(collectionDue({next_attempt:1301,refresh_after:300},true,1300),true);
 assert.equal(collectionDue({next_attempt:1301,refresh_after:300,error:'Unavailable'},true,1300),false);
 assert.equal(collectionDue({},false,1300),true);
});

test('opaque provider IDs preserve punctuation and reject loss through trimming or truncation',()=>{
 for(const id of ['row-a~bc.d-efgh','row-a!bc.d-efgh','row-a_bc.d-efgh']){assert.equal(normalizeSFPD([{...rows()[0],source_row_id:id}],TODAY)[0].id,'sfpd-flight:'+id);}
 for(const id of ['',null,42,'has space','x'.repeat(201),' a','a\n']){assert.throws(()=>normalizeSFPD([{...rows()[0],source_row_id:id}],TODAY),/Invalid SFPD row identifier/);}
});

test('real published Socrata IDs survive the complete adapter unchanged',()=>{
 const live=JSON.parse(readFileSync(new URL('./fixtures/sfpd-opaque-ids.json',import.meta.url)));
 const records=normalizeSFPD(live,TODAY);assert.equal(records.length,3);
 assert.deepEqual(records.map(r=>r.id),live.map(r=>'sfpd-flight:'+r.source_row_id));
});
