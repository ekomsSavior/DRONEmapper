import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {radioProfilesFor,signalContext} from '../public/radio-reference-model.mjs';
import {parseWardrive} from '../worker/wardrive-parser.mjs';
import {validateBatch,nodeRecord} from '../worker/node-records.mjs';

const read=p=>JSON.parse(fs.readFileSync(p));
const radio=read('public/radio-references.json');
test('offline reference catalogs match and every fact keeps its evidence',()=>{
 for(const path of ['android-node/app/src/main/assets/radio-references.json','linux-node/dronemapper_node/static/radio-references.json'])assert.deepEqual(read(path),radio);
 const systems=read('integration/device-systems.json').profiles;
 for(const p of radio.profiles){
  const original=systems.find(s=>s.id===p.id);assert.ok(original);
  assert.equal(p.configuration,original.configuration);
  assert.deepEqual(p.facts,original.facts.filter(f=>f.section==='radios'));
  assert.ok(p.facts.every(f=>f.sources.length&&f.sources.every(u=>u.startsWith('https://'))));
 }
});
test('model matching preserves manufacturer, revision, module and candidate boundaries',()=>{
 const ids=r=>radioProfilesFor(r,radio.profiles).map(p=>p.id);
 assert.ok(ids({manufacturer:'DJI',model:'Mini 4 Pro'}).includes('dji-mini4pro'));
 assert.ok(!ids({manufacturer:'DJI',model:'Mini 3'}).includes('dji-mini4pro'));
 assert.deepEqual(ids({manufacturer:'Other',model:'Mini 4 Pro'}),[]);
 assert.deepEqual(ids({manufacturer:'DJI',model:'Mini 4 Pro',record_type:'signal'}),[]);
 assert.ok(!ids({manufacturer:'Skydio',model:'Skydio Beacon+'}).includes('skydio-beacon-manual2022'));
 assert.ok(!ids({manufacturer:'DJI',model:'Mini 4 Pro',kind:'regulatory-equipment',fcc_id:'unknown'}).length);
});
test('live map labels BLE and ground candidates without camera-drone inference',()=>{
 const ble=signalContext({signature:'cyberdog-ble-v1'});assert.equal(ble.radio,'Bluetooth LE');assert.doesNotMatch(ble.evidence,/camera drones/);
 const robot=signalContext({signature:'turtlebot4-setup-wifi-name',frequency_mhz:5180});
 assert.equal(robot.radio,'Wi-Fi · 5180 MHz');assert.match(robot.evidence,/first boot/);assert.match(robot.evidence,/not the robot position/);
 assert.doesNotMatch(signalContext({signature:'wifi-cam-name'}).radio,/undefined/);
});
test('TurtleBot CSV retains time and coarse location without manufacturing identity',()=>{
 const now=Date.now()/1000,stamp=Math.floor(now-86400);
 const csv='MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,Type\n00:11:22:33:44:55,Turtlebot4,[WPA2],'+new Date(stamp*1000).toISOString()+',36,-50,37.12345,-122.12345,WIFI\n';
 const row=parseWardrive(csv,'UTC',now).observations[0];
 assert.equal(row.signature,'turtlebot4-setup-wifi-name');assert.equal(row.frequency_mhz,5180);assert.equal(row.observed_at,stamp);assert.equal(row.latitude,37.125);
 assert.equal(row.ssid,undefined);assert.equal(row.model,undefined);
});

test('live upload accepts the new rule only with its transport and privacy envelope',()=>{
 const now=Math.floor(Date.now()/1000),id='11111111-1111-4111-8111-111111111111';
 const raw={event_id:id,candidate_id:id,observation_type:'wifi-robot-candidate',signature:'turtlebot4-setup-wifi-name',frequency_mhz:5180,latitude:37.125,longitude:-122.125,observed_at:now,received_at:now,location_grid_degrees:.01};
 const body={schema_version:1,node_id:id,observations:[raw]};assert.deepEqual(validateBatch(body,now),[raw]);
 const record=nodeRecord(raw,id,now);assert.equal(record.kind,'possible-robot');assert.equal(record.domain,'ground');assert.equal(record.manufacturer,null);assert.equal(record.model,null);
 assert.equal(record.latitude,37.125);assert.equal(record.position_basis,'receiver-area');
 assert.throws(()=>validateBatch({...body,observations:[{...raw,ssid:'Turtlebot4'}]},now));
 assert.throws(()=>validateBatch({...body,observations:[{...raw,observation_type:'ble-robot-candidate'}]},now));
});
