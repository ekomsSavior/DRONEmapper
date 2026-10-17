import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBatch,identify,nodeRecord,mergeNodeRows} from '../worker/node-records.mjs';
const now=1792170000,id='12345678-1234-1234-1234-123456789abc';
const serial=s=>Buffer.from(s).toString('hex').padEnd(40,'0');
const candidate=()=>({event_id:id,observation_type:'wifi-candidate',candidate_id:id,signature:'wifi-cam-name',frequency_mhz:2412,latitude:37.125,longitude:-122.125,location_grid_degrees:.01,observed_at:now,received_at:now});
const batch=r=>({schema_version:1,node_id:id,observations:[r]});
test('candidate accepts only coarse receiver cells, no raw MAC/SSID/GPS',()=>{
 assert.equal(validateBatch(batch(candidate()),now).length,1);
 for(const extra of [{ssid:'WIFI_8K__test'},{mac:'00:11:22:33:44:55'},{latitude:37.123456},{observed_at:now-901},{frequency_mhz:0},{manufacturer:'guessed'}])assert.throws(()=>validateBatch(batch({...candidate(),...extra}),now));
 const r=nodeRecord(candidate(),'signal-test',now);
 assert.equal(r.record_type,'signal');assert.equal(r.position_basis,'receiver-area');assert.equal(r.manufacturer,null);
});
test('serial catalog distinguishes aircraft, unknown identity and broadcast module',()=>{
 assert.equal(identify(serial('1581F4XF000000000001'),1).model,'Mini 3 Pro');
 assert.equal(identify(serial('1581F4XF000000000001'),2).model,null);
 assert.equal(identify(serial('1581F4XF000000000001'),1,[]).model,null);
 const rules=[{start:'ABCD3AAA',end:'ABCD3ZZZ',manufacturer:'Fixture',model:'Module',device_type:'module'}];
 const matched=identify(serial('ABCD3BCD'),1,rules);
 assert.equal(matched.model,null);assert.equal(matched.module_model,'Module');
 assert.equal(identify(serial('ABCD3BCD'),1,[...rules,{...rules[0],model:'Other'}]).identification,'ambiguous-catalog-match');
 assert.equal(identify(serial('ABCD4BCD'),1,rules).model,null);
});
test('aggregation keeps signal areas out of aircraft trails and flags conflicting reports',()=>{
 const r=nodeRecord(candidate(),'signal-test',now);
 const signals=mergeNodeRows([{node:'a',last_seen:now,data:JSON.stringify(r)}],now);
 assert.equal(signals[0].live,false);assert.deepEqual(signals[0].trail,[]);
 const a={...r,record_type:'position',id:'rid-test'};
 const rows=[{node:'a',last_seen:now,data:JSON.stringify(a)},{node:'b',last_seen:now,data:JSON.stringify({...a,latitude:38})}];
 const [merged]=mergeNodeRows(rows,now);
 assert.equal(merged.reporting_nodes,2);assert.equal(merged.position_conflict,true);assert.equal(merged.live,false);assert.deepEqual(merged.trail,[]);
});

test('documented Tello SSID is an unconfirmed receiver area, never an identified aircraft',()=>{
 const raw={...candidate(),signature:'tello-name'};
 assert.equal(validateBatch(batch(raw),now).length,1);
 const record=nodeRecord(raw,'signal-test',now);
 assert.equal(record.record_type,'signal');
 assert.equal(record.manufacturer,null);
 assert.equal(record.model,null);
 assert.match(record.name,/Possible drone/);
 assert.equal(record.position_basis,'receiver-area');
 assert.throws(()=>validateBatch(batch({...raw,signature:'any-wifi'}),now));
});

 test('USB NAN positions use the same validation and original observation time',()=>{
 const raw={event_id:id,rid:serial('TEST-ONLY'),id_type:1,aircraft_type:2,protocol:'usb-wifi-nan',
 latitude:37,longitude:-122,observed_at:now-10,received_at:now-9};
 const [event]=validateBatch(batch(raw),now);
 assert.equal(event.protocol,'usb-wifi-nan');assert.equal(event.observed_at,now-10);
 assert.throws(()=>validateBatch(batch({...raw,protocol:'usb-any-radio'}),now));
 });
