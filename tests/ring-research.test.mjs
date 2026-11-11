import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deviceReference,deviceManufacturer} from '../public/security-device-references.mjs';
import {systemBreakdown} from '../public/device-system-model.mjs';
import {radioProfilesFor} from '../public/radio-reference-model.mjs';
import {vendorFlow} from '../public/vendor-flow-model.mjs';

const read=p=>JSON.parse(fs.readFileSync(p));
const rows=read('public/downloads/data/devices-global.json').devices;
test('announced Ring models and historical equipment have separate identities and sources',()=>{
 for(const [model,kind] of [['Drone Cam','drone'],['Rover Cam','ground'],['Always Home Cam','drone']]){
  assert.equal(deviceReference('Ring Robotics',model,kind).model,model);
  const record=rows.find(r=>r.maker==='Ring'&&r.name==='Ring '+model);
  assert.ok(record,model);assert.equal(record.mac_allocations.length,13);
  assert.deepEqual(record.scanner_signatures,[]);
  const system=systemBreakdown(record);assert.equal(system.complete_bill_of_materials,false);
  assert.equal(system.sections.compute.facts.length,0);
  assert.equal(system.sections.memory.facts.length,0);
  if(model!=='Always Home Cam'){
   assert.equal(system.sections.radios.status,'documented');
   const radio=radioProfilesFor(record,read('public/radio-references.json').profiles);
   assert.equal(radio.length,1);assert.deepEqual(radio[0].rf_channels,[]);
   assert.match(JSON.stringify(radio[0].facts),/2\.4/);
   assert.ok(!JSON.stringify(record.rf_information).includes('2AEUPBHAZU001'));
  }
 }
 for(const args of [['Ring','Rover Cam','drone'],['Other','Drone Cam','drone'],['Ring','Drone Cam 2','drone']])assert.equal(deviceReference(...args),null);
});
test('historical Ring grant ranges cannot become successor radio presets or identity decoders',()=>{
 const ranges=read('integration/rf-channels.json').channels.filter(r=>r.id.startsWith('model-ring-'));
 assert.equal(ranges.length,7);
 for(const r of ranges){
  assert.equal(r.system_profile_ids,'ring-always-home-cam-bhazu001-2021');
  assert.equal(r.decoder,'none');assert.equal(r.bandwidth_mhz,null);
  assert.match(r.notes,/Not verified for 2026 Drone Cam or Rover Cam/);
 }
 const fcc=read('integration/fcc-references.json').devices.filter(r=>r.vendor_id==='ring');
 assert.equal(fcc.length,1);assert.equal(fcc[0].original_grant,'2021-09-28');
 assert.equal(fcc[0].scanner_signature,false);
});
test('Ring cloud graph contains only the documented logical workflows',()=>{
 const graph=vendorFlow('Ring');assert.equal(graph.edges.length,8);
 for(const edge of graph.edges)assert.ok(edge.source.startsWith('https://www.aboutamazon.com/')||edge.source.startsWith('https://assets.aboutamazon.com/'));
 const service=read('integration/cloud-surfaces.json').services.find(s=>s.id==='ring-robotics');
 assert.doesNotMatch(JSON.stringify(service.path),/firmwrms|shuttle|map-service/);
 assert.match(service.gap,/No public robot telemetry API/);
 const take=read('integration/cloud-surfaces.json').services.find(s=>s.id==='ring-take');
 assert.match(take.gap,/compatibility not independently verified/);
});
test('Ring manufacturer allocation scope excludes broad Amazon assignments and model detectors',()=>{
 const ring=deviceManufacturer('Ring LLC');assert.equal(ring.prefixes.length,13);
 assert.match(ring.evidence,/Shared across Ring products/);
 assert.equal(deviceManufacturer('Amazon Technologies'),null);
 assert.ok(!read('integration/robot-signatures.json').rules.some(r=>/ring/i.test(r.id)));
 assert.equal(read('docs/ring-refresh-review.json').integrated.new_map_observations,0);
 assert.ok(!read('integration/drone-oui-subset.json').manufacturers.includes('Ring'));
 assert.doesNotMatch(fs.readFileSync('public/downloads/data/drone-oui.csv','utf8'),/Ring/);
 const observations=read('public/downloads/ring-cloud-observations.json');
 assert.equal(observations.model_association,'unconfirmed');
 assert.equal(observations.hostname_count,observations.hostnames.length);
});
