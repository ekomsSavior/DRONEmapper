import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rules} from '../worker/rid-catalog.mjs';
import {identify} from '../worker/node-records.mjs';
import {adapters,publicRecord} from '../worker/sources.mjs';
const hex=s=>Buffer.from(s).toString('hex').padEnd(40,'0');
test('expanded FAA catalog identifies reviewed serials without bridging missing allocations',()=>{
 for(const [s,model] of [
  ['1839FTD5029323320001','Teal 2'],
  ['1914CL2D233900001','LEMUR 2'],
  ['1656DTYR14MBD00001','Trinity R14'],
  ['174442423','WingtraOne Gen II'],
  ['18735P2721','P2 Zip'],
  ['1644FMD4100000007004','md4-1000'],
  ['18088FDA972B6','Commander3 XL'],
  ['1886BSKY20002000','SKY II'],
  ['1634FS0TEN2600A02715','SOTEN'],
  ['18106M22010','M2'],
  ['16355A9551','Hummingbird v2'],
 ])assert.equal(identify(hex(s),1).model,model);
 for(const s of ['1839FTD502932332000A','1839FTD5029323320501','1634FS0TEN2600A0271A'])
  assert.equal(identify(hex(s),1).model,null);
 assert.equal(identify(hex('18106M22021'),1).identification,'ambiguous-catalog-match');
 assert.equal(identify(hex('18106M22021'),1).model,null);
 const module=identify(hex('18179300000000'),1);
 assert.equal(module.model,null);
 assert.equal(module.module_model,'Remote ID Upgrade Kit (Alta X)');
});
test('all scanner catalogs contain the same rules and decimal constraints',()=>{
 const desktop=JSON.parse(fs.readFileSync(new URL('../linux-node/dronemapper_node/data/rid-catalog.json',import.meta.url)));
 assert.deepEqual(desktop,rules);
 const java=fs.readFileSync(new URL('../android-node/app/src/main/java/org/churchofmalware/dronemapper/node/ModelCatalog.java',import.meta.url),'utf8');
 const rows=[...java.matchAll(/^\s+\{("(?:[^"\\]|\\.)*"(?:, "(?:[^"\\]|\\.)*"){5})\},$/gm)].map(m=>JSON.parse('['+m[1]+']'));
 assert.deepEqual(rows,rules.map(r=>[r.start,r.end,r.manufacturer,r.model,r.device_type,String(r.decimal_suffix||'')]));
 assert.match(java,/rule\[5\].isEmpty\(\)/);
});
test('historical milestones stay historical through the public adapter',async()=>{
 const {records}=await adapters.milestones();
 assert.equal(records.length,43);
 for(const source of records){
  const r=publicRecord(source);
  assert.equal(r.record_type,'historical');
  assert.equal(r.observed_at,null);
  assert.equal(r.source_url,undefined);
  assert.equal(r.evidence_url,undefined);
  assert.ok(r.record_dates);
 }
});

test('October 21 declarations retain sparse allocations instead of prefix guesses',()=>{
 assert.equal(identify(hex('18136H6E120'),1).model,'Carrier H6');
 assert.equal(identify(hex('18136H8E025'),1).model,'Carrier H8E');
 assert.equal(identify(hex('1863FPEG821800000000'),1).model,'P100');
 assert.equal(identify(hex('1863FPEG821900000000'),1).model,'P100 Pro');
 assert.equal(identify(hex('17868SN000714'),1).model,'MK27-2');
 assert.equal(identify(hex('178650100E'),1).model,'MK30');
 assert.equal(identify(hex('1863FPEG822300000000'),1).model,'P150');
 assert.equal(identify(hex('1862CE1G125130174'),1).model,'Evo');
 assert.equal(identify(hex('1863F242000000000000'),1).model,'P60');
 assert.equal(identify(hex('2095FH05000000000000'),1).model,'ZZ-H-1-003');
 assert.equal(identify(hex('2095FH04000000000000'),1).model,'ZZ-H-1-004');
 assert.equal(identify(hex('1863F251000000000000'),1).model,'P150 Max');
 assert.equal(identify(hex('17868SN000715'),1).model,null);
 assert.equal(identify(hex('17868SN000739'),1).model,null);
 assert.equal(identify(hex('18136H6E118'),1).model,null);
 assert.equal(identify(hex('1862CE1G125130173'),1).model,null);
});
