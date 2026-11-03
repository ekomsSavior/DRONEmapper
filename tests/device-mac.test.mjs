import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deviceMacData} from '../public/device-mac-data.mjs';
import {macAllocationsFor,formatMacPrefix} from '../public/device-mac-model.mjs';

test('Device Library and global JSON expose the same reviewed manufacturer allocations',()=>{
 const canonical=JSON.parse(readFileSync(new URL('../integration/device-oui.json',import.meta.url)));
 assert.deepEqual(deviceMacData,canonical);
 const data=JSON.parse(readFileSync(new URL('../public/downloads/data/devices-global.json',import.meta.url)));
 for(const device of data.devices){
  if(device.kind==='regulatory-equipment'){assert.deepEqual(device.mac_allocations,[]);continue;}
  assert.deepEqual(macAllocationsFor(device.maker).map(a=>a.prefix).sort(),device.mac_allocations.map(a=>a.prefix).sort(),device.maker+' / '+device.name);
 }
});

test('exact manufacturer identities and aliases exclude similarly named companies',()=>{
 assert.deepEqual(macAllocationsFor('Flock Safety').map(a=>a.prefix),['B41E52']);
 assert.deepEqual(macAllocationsFor('Freefly Systems').map(a=>a.prefix),['EC715E']);
 assert.deepEqual(macAllocationsFor('Zoox').map(a=>a.prefix),['B0B353B']);
 assert.deepEqual(macAllocationsFor('FANUC Corporation'),macAllocationsFor('FANUC Robotics'));
 for(const name of ['Holy Stone','Clearpath Robotics / OTTO Motors','Unitree Robotics','Petoi','Unknown manufacturer','Flock Audio Inc.','GADZOOX NETWORKS','Symboticware Incorporated'])assert.deepEqual(macAllocationsFor(name),[],name);
});

test('MAC display preserves MA-M, MA-S and legacy IAB mask boundaries',()=>{
 const get=name=>macAllocationsFor(name)[0];
 assert.equal(formatMacPrefix(get('Flock Safety')),'B4:1E:52');
 assert.equal(formatMacPrefix(get('Anduril Industries')),'E8:B4:70:C0:00:00/28');
 assert.equal(formatMacPrefix(get('Anduril Imaging')),'8C:1F:64:76:30:00/36');
 assert.equal(formatMacPrefix(get('Liquid Robotics')),'00:50:C2:EC:70:00/36');
 for(const a of deviceMacData.allocations){
  assert.ok(a.source.startsWith('https://standards-oui.ieee.org/'));
  assert.equal(a.prefix.length*4,a.prefix_bits);
  assert.equal(parseInt(a.prefix.slice(0,2),16)&3,0,'Globally assigned unicast prefix');
 }
 assert.throws(()=>formatMacPrefix({prefix:'E8B470C',prefix_bits:24}));
});
