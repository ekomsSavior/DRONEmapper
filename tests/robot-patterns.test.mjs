import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {robotSignatures,robotWifiSignature} from '../public/robot-signatures.mjs';
import {parseWardrive} from '../worker/wardrive-parser.mjs';
import {robotPlatforms} from '../public/robot-platforms.mjs';
import {libraryModels} from '../public/device-library-model.mjs';

test('every researched robot is in both offline catalogs and the web library',()=>{
 const canonical=JSON.parse(fs.readFileSync('integration/robot-platforms.json'));
 assert.deepEqual(robotPlatforms,canonical);
 for(const file of ['android-node/app/src/main/assets/robot-platforms.json','linux-node/dronemapper_node/data/robot-platforms.json'])assert.deepEqual(JSON.parse(fs.readFileSync(file)),canonical);
 const models=libraryModels();
 assert.equal(new Set(canonical.models.map(m=>m.id)).size,canonical.models.length);
 for(const m of canonical.models){
  assert.ok(models.some(v=>v.id===m.id&&v.maker===m.manufacturer),m.id);
  assert.ok(m.sources.length&&m.sources.every(s=>s.startsWith('https://')));
  assert.ok(m.reception&&m.connection&&m.url&&m.manufacturer_url);
 }
});

test('generated catalogs stay identical across Android, desktop and web',()=>{
 const canonical=JSON.parse(fs.readFileSync('integration/robot-signatures.json'));
 assert.deepEqual(robotSignatures,canonical);
 for(const file of ['android-node/app/src/main/assets/robot-signatures.json','linux-node/dronemapper_node/data/robot-signatures.json'])assert.deepEqual(JSON.parse(fs.readFileSync(file)),canonical);
 for(const rule of canonical.rules){assert.ok(rule.sources.every(s=>s.startsWith('https://')));assert.match(rule.validation,/not tested/);}
});
test('strict Wi-Fi names reject generic devices, shortened names and injected lines',()=>{
 for(const [name,id] of [['Unitree_Go1ABC123','unitree-go1-wifi-name'],['Bittle-AP','petoi-bittle-ap-name'],['RMS1-ABC123','robomaster-s1-wifi-name'],['RMEP-12AB34','robomaster-ep-wifi-name']]){
  assert.equal(robotWifiSignature(name),id);
  for(const bad of [name+'\n',name+'\r',name+'x',' '+name,'x'+name])assert.equal(robotWifiSignature(bad),null);
 }
 for(const bad of ['Unitree','Unitree_Go2ABC123','Spot','robot dog','Bittle','RMS1-ABC','Home Router',null])assert.equal(robotWifiSignature(bad),null);
});
test('old robot Wi-Fi CSV preserves observation time and receiver grid without identity claims',()=>{
 const now=Date.now()/1000,stamp=Math.floor(now-86400);
 const csv='MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,Type\n00:11:22:33:44:55,RMS1-ABC123,[OPEN],'+new Date(stamp*1000).toISOString()+',6,-50,37.12345,-122.12345,WIFI\n';
 const row=parseWardrive(csv,'UTC',now).observations[0];
 assert.equal(row.signature,'robomaster-s1-wifi-name');assert.equal(row.observed_at,stamp);assert.equal(row.latitude,37.125);
 assert.equal(row.ssid,undefined);assert.equal(row.model,undefined);
});
