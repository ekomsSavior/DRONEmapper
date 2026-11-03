import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deviceSystems} from '../public/device-system-data.mjs';
import {systemBreakdown} from '../public/device-system-model.mjs';

const system=(maker,name,extra={})=>systemBreakdown({maker,name,...extra});
const text=s=>JSON.stringify(s);
const profileIds=s=>s.configurations.map(p=>p.id);

test('reviewed components have sources, explicit models and no complete-BOM claim',()=>{
 const canonical=JSON.parse(fs.readFileSync(new URL('../integration/device-systems.json',import.meta.url)));
 assert.deepEqual(deviceSystems.profiles,canonical.profiles);
 assert.equal(new Set(canonical.profiles.map(p=>p.id)).size,canonical.profiles.length);
 for(const p of canonical.profiles){
  assert.ok(p.models.length&&p.configuration&&p.reviewed_on);
  for(const f of p.facts){
   assert.ok(f.component&&f.details&&f.sources.length,p.id);
   for(const url of f.sources)assert.equal(new URL(url).protocol,'https:');
  }
 }
});

test('similar products never inherit exact-model processor assignments',()=>{
 assert.match(text(system('Skydio','X10')),/QRB5165/);
 assert.deepEqual(profileIds(system('Skydio','X10D')),['skydio-x10d']);
 assert.doesNotMatch(text(system('Skydio','X10D')),/QRB5165/);
 assert.deepEqual(profileIds(system('Parrot','ANAFI USA')),['parrot-anafi-usa']);
 assert.doesNotMatch(text(system('Parrot','ANAFI USA')),/QRB5165/);
 assert.match(text(system('Parrot','ANAFI UKR')),/QRB5165/);
 assert.doesNotMatch(text(system('Parrot','ANAFI Ai')),/Ambarella|QRB5165/);
 assert.equal(profileIds(system('Unknown manufacturer','X10')).length,0);
 assert.equal(profileIds(system('Unitree Robotics','Unknown model')).length,0);
 assert.equal(profileIds(system('DJI','RoboMaster EP')).length,0);
});

test('optional payloads and board revisions preserve their configuration boundaries',()=>{
 const spot=system('Boston Dynamics','Spot');
 assert.match(spot.configurations[0].configuration,/optional CORE I\/O/);
 assert.ok(spot.sections.compute.facts.every(f=>/payload/i.test(f.configuration)));
 assert.equal(spot.complete_bill_of_materials,false);
 const bittle=system('Petoi','Bittle X'),v2=system('Petoi','Bittle X V2');
 assert.match(text(bittle),/16 MB/);
 assert.doesNotMatch(text(v2),/16 MB/);
 assert.match(text(v2),/4 MB/);
 assert.match(text(system('SunFounder','PiDog')),/Pi 5 configurations/);
});

test('unknown hardware and software entries retain explicit gaps',()=>{
 const unknown=system('Unknown manufacturer','Unknown model');
 assert.equal(unknown.record_scope,'unidentified-model');
 assert.equal(unknown.status,'research-needed');
 assert.equal(unknown.sections.compute.status,'not-established');
 assert.equal(unknown.complete_bill_of_materials,false);
 assert.equal(system('Example','Fleet platform',{category:'software'}).record_scope,'software-platform');
 assert.equal(system('Example','Robot family',{category:'family'}).record_scope,'program-or-family');
});

test('robot generations and optional perception computers remain distinct',()=>{
 const first=system('Xiaomi','CyberDog'), second=system('Xiaomi','Xiaomi CyberDog 2');
 assert.match(text(first),/D450/);
 assert.match(text(first),/128 GB SSD/);
 assert.doesNotMatch(text(first),/D430|TG30/);
 assert.match(text(second),/D430/);
 assert.match(text(second),/16 GB eMMC/);
 assert.doesNotMatch(text(second),/D450|128 GB SSD/);
 const lite=system('DEEP Robotics','DEEP Robotics Lite3');
 assert.match(text(lite),/RK3588/);
 const nx=lite.sections.compute.facts.find(f=>/Xavier NX/.test(f.details));
 assert.match(nx.details,/Pro\/LiDAR/);
 assert.match(text(system('Petoi','Bittle X+Arm')),/4 MB/);
 assert.doesNotMatch(text(system('Petoi','Bittle X+Arm')),/16 MB/);
 assert.deepEqual(profileIds(system('Hello Robot','Stretch')),[]);
 assert.deepEqual(profileIds(system('Boston Dynamics','Stretch')),['boston-dynamics-stretch']);
});

test('radio references do not become model identity or unreviewed scanner signatures',()=>{
 const go1=system('Unitree','Go1'),go2=system('Unitree','Go2');
 assert.ok(go1.sections.identification.facts.some(f=>f.pattern?.id==='unitree-go1-wifi-name'));
 assert.ok(go2.sections.identification.facts.every(f=>!f.pattern));
 assert.ok(system('Skydio','X10').sections.identification.facts.some(f=>f.evidence==='manufacturer-only'));
 const equipment=system('Skydio','X10',{kind:'regulatory-equipment',fcc_id:'TEST',source:'https://example.org/grant',frequencies_mhz:[[2400,2483.5]],evidence_status:'pending-primary-review'});
 assert.equal(equipment.configurations.length,0);
 assert.equal(equipment.sections.compute.facts.length,0);
 assert.equal(equipment.sections.identification.facts.length,0);
 assert.equal(equipment.sections.radios.facts[0].evidence,'pending-primary-review');
});

test('global JSON and website use the same per-record system evidence',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../public/downloads/data/devices-global.json',import.meta.url)));
 for(const d of data.devices){
  assert.deepEqual(d.system_breakdown,systemBreakdown(d),d.catalog_id);
  assert.equal(d.system_breakdown.complete_bill_of_materials,false);
 }
 assert.equal(data.counts.system_profiles,deviceSystems.profiles.length);
 assert.equal(data.counts.devices_with_system_profiles,data.devices.filter(d=>d.system_breakdown.configurations.length).length);
});
