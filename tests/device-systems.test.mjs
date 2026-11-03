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
 assert.deepEqual(profileIds(system('DJI','RoboMaster EP')),['dji-robomaster-ep']);
 assert.doesNotMatch(text(system('DJI','RoboMaster EP')),/Cortex-A|Tegra|Snapdragon/);
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

test('RID generations and aircraft variants preserve their documented hardware',()=>{
 const first=system('Dronetag','Beacon'),second=system('Dronetag','Beacon gen.2');
 assert.match(text(first),/Micro USB/);
 assert.match(text(first),/conflicts on the USB connector/);
 assert.match(text(second),/USB-C/);
 assert.match(text(second),/BeiDou B1C/);
 assert.doesNotMatch(text(first.sections.sensors),/BeiDou B1C/);
 const dri=system('Dronetag','DRI');
 assert.match(text(dri.sections.sensors),/No onboard sensors/);
 assert.match(text(dri.sections.interfaces),/MAVLink 2/);
 assert.match(text(system('Dronetag','BS').sections.sensors),/Onboard GNSS/);
 const lite=system('Autel Robotics','EVO Lite'),plus=system('Autel Robotics','EVO Lite+');
 assert.match(text(lite.sections.sensors),/four-axis/);
 assert.doesNotMatch(text(plus.sections.sensors),/four-axis/);
 assert.match(text(plus.sections.sensors),/three-axis/);
 assert.equal(profileIds(system('Autel Robotics','EVO Lite Enterprise')).length,0);
 const rtk=system('DJI','Phantom 4 RTK');
 assert.match(text(rtk.sections.memory),/Standard Android controller: 4 GB RAM/);
 assert.equal(profileIds(system('DJI','Phantom 4 Pro')).length,0);
});

test('new robot profiles distinguish generations, optional radios and connector types',()=>{
 const t1=system('Booster Robotics','Booster T1');
 assert.match(text(t1.sections.compute),/Basic: one Jetson AGX Orin 32GB/);
 assert.match(text(t1.sections.compute),/Standard: Express-i7/);
 assert.match(text(t1.sections.memory),/motion board 8 GB/);
 const hb4=system('MAB Robotics','Honey Badger 4.0'),hb5=system('MAB Robotics','Honey Badger 5.0');
 assert.doesNotMatch(text(hb4),/Orin Nano|UP Squared/);
 assert.match(text(hb5.sections.compute),/Orin Nano Super/);
 assert.match(hb5.configurations[0].configuration,/conflicting revision/);
 assert.match(text(hb5.sections.identification),/changeable\/spoofable/);
 assert.ok(hb5.sections.identification.facts.every(f=>!f.pattern));
 const lovot2=system('Groove X','LOVOT 2.0'),lovot3=system('Groove X','LOVOT 3.0');
 assert.doesNotMatch(text(lovot2),/Orin NX|512 GB/);
 assert.match(text(lovot3.sections.compute),/Orin NX/);
 assert.equal(system('Groove X','Lovot').configurations.length,2);
 const ohmni=system('OhmniLabs','Ohmni');
 assert.match(text(ohmni.sections.interfaces),/not Ethernet/);
 assert.match(text(ohmni.sections.radios),/not established as built-in/);
 assert.equal(profileIds(system('OhmniLabs','OhmniCare')).length,0);
 const s2=system('UBTech Robotics','Walker S2');
 assert.match(text(s2.sections.compute),/x86 computer plus NVIDIA Jetson Orin/);
 assert.doesNotMatch(text(s2.sections.compute),/1185G7|64 GB|275 TOPS/);
 assert.equal(profileIds(system('UBTech Robotics','Walker S1')).length,0);
});

test('humanoid variant tables do not transfer enhanced hardware into base models',()=>{
 const x2=system('AgiBot','X2'), ultra=system('AgiBot','X2 Ultra');
 assert.match(text(x2.sections.compute),/RK3588/);
 assert.doesNotMatch(text(x2.sections.compute),/Orin/);
 assert.match(text(x2.sections.sensors),/no lidar or RGB-D/);
 assert.match(text(ultra.sections.compute),/Orin NX/);
 assert.equal(profileIds(system('AgiBot','AgiBot Lingxi X2')).length,2);
 assert.doesNotMatch(text(system('AgiBot','A2 Lite').sections.compute),/Orin 64G/);
 assert.match(text(system('AgiBot','A2 Ultra').sections.compute),/Orin 64G/);
 const kuavo=system('Leju Robotics','KUAVO 4pro Standard');
 assert.match(text(kuavo.sections.memory),/Motion computer: 64 GB/);
 assert.match(text(kuavo.sections.memory),/Orin computer: 8 GB/);
 assert.equal(profileIds(system('Leju Robotics','KUAVO 5')).length,0);
 assert.equal(profileIds(system('1X Technologies','NEO Beta')).length,0);
 assert.doesNotMatch(text(system('Fourier Intelligence','GR-2').sections.compute),/Ryzen|RK3588/);
 const franka=system('Franka Robotics','Franka Research 3');
 assert.match(text(franka.sections.compute),/external equipment/);
 assert.match(text(franka.sections.software),/not arm X5/);
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
