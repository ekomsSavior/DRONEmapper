import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ioosDatasets,ioosMetadata,ioosPositionUrl,normalizeIOOS,fetchIOOS} from '../worker/ioos-source.mjs';
import {deduplicateGliderPositions} from '../worker/voto-source.mjs';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/ioos-spray.json',import.meta.url)));
const now=Date.parse('2026-10-16T20:00:00Z')/1000;
const meta=()=>ioosMetadata(structuredClone(f.metadata),f.dataset_id);
test('IOOS retains real surface GPS time, identity, quality and credit',()=>{
 const [r]=normalizeIOOS(f.position,meta(),now);
 assert.equal(r.id,'ioos:4802946');assert.equal(r.observed_at,Date.parse('2026-10-16T16:26:00Z')/1000);
 assert.equal(r.position_method,'surface-gps');assert.equal(r.latitude,34.3853);assert.equal(r.license,'CC BY 4.0');
 assert.ok(r.attribution.includes('Scripps'));assert.equal(r.model,'Spray glider');
});
test('IOOS rejects bad QC, stale/future/invalid GPS and mismatched WMO',()=>{
 for(const [i,v] of [[0,'9999999'],[1,'2026-10-14T12:00:00Z'],[1,'2026-10-17T12:00:00Z'],[1,'2026-10-16T16:26:00'],[2,91],[2,null],[3,181],[4,2],[4,true]]){
  const p=structuredClone(f.position);p.table.rows[0][i]=v;assert.deepEqual(normalizeIOOS(p,meta(),now),[]);
 }
 const p=structuredClone(f.position);p.table.columnUnits[2]='radians';assert.throws(()=>normalizeIOOS(p,meta(),now));
});
test('IOOS refuses changed quality meanings, estimated schema and missing license',()=>{
 for(const [variable,attribute,value] of [['gps_end_qc','flag_meanings','bad good'],['gps_end_lat','comment','Interpolated profile midpoint'],['NC_GLOBAL','license','All rights reserved'],['platform','id','sp099']]){
  const p=structuredClone(f.metadata);p.table.rows.find(r=>r[1]===variable&&r[2]===attribute)[4]=value;
  assert.throws(()=>ioosMetadata(p,f.dataset_id));
 }
 assert.throws(()=>ioosPositionUrl('../other'));
});
test('IOOS catalog is bounded and only admits reviewed fresh Spray deployments',()=>{
 const p={table:{columnNames:['datasetID','title','maxTime'],rows:[[f.dataset_id,'Spray','2026-10-16T16:26:00Z'],['sg148-20260722T1939','Seaglider','2026-10-16T16:26:00Z'],['sp099-20260101T0000','old','2026-01-01T00:00:00Z']]}};
 assert.deepEqual(ioosDatasets(p,now),[f.dataset_id]);
 p.table.rows=Array.from({length:33},(_,i)=>['sp'+String(i).padStart(3,'0')+'-20261012T1606','Spray','2026-10-16T16:26:00Z']);
 assert.throws(()=>ioosDatasets(p,now));
});
test('IOOS fetch errors propagate and shared WMO produces one latest map record',async()=>{
 const catalog={table:{columnNames:['datasetID','title','maxTime'],rows:[[f.dataset_id,'Spray','2026-10-16T16:26:00Z']]}};
 const fetch=async url=>url.includes('allDatasets')?catalog:url.includes('/info/')?f.metadata:f.position;
 const {records}=await fetchIOOS(fetch,now);assert.equal(records.length,1);
 const older={...records[0],id:'glider:4802946',observed_at:records[0].observed_at-60};
 assert.equal(deduplicateGliderPositions([older,...records]).length,1);
 assert.equal(deduplicateGliderPositions([older,...records])[0].id,'ioos:4802946');
 await assert.rejects(fetchIOOS(async url=>{if(url.includes('/info/'))throw Error('unavailable');return catalog;},now));
});
