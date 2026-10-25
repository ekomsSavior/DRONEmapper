import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deviceReferences,deviceReference,deviceManufacturer} from '../public/security-device-references.mjs';
import {companyWebsite,modelWebsite} from '../public/company-links.mjs';

test('published references stay identical in the website and offline scanners',()=>{
 const canonical=readFileSync(new URL('../integration/security-device-references.json',import.meta.url));
 assert.ok(canonical.length<65536);
 assert.deepEqual(deviceReferences,JSON.parse(canonical));
 for(const p of ['android-node/app/src/main/assets','linux-node/dronemapper_node/data'])
  assert.equal(readFileSync(new URL('../'+p+'/security-device-references.json',import.meta.url)).toString(),canonical.toString());
 assert.equal(deviceReferences.models.filter(m=>m.group==='anduril').length,32);
 for(const m of deviceReferences.models){
  for(const key of ['url','source','manufacturer_url']){
   const u=new URL(m[key]);assert.equal(u.protocol,'https:');assert.equal(u.username+u.password,'');
  }
  assert.equal('latitude' in m,false);assert.equal('longitude' in m,false);
 }
});
test('manufacturer, full model and device kind must agree before showing reference details',()=>{
 assert.equal(deviceReference(' Anduril ','Ghost (Ghost-X)','drone').model,'Ghost-X');
 assert.equal(deviceReference('Anduril Industries','Ghost Shark (XL-AUV)','underwater').model,'Ghost Shark');
 assert.equal(deviceReference('Anduril','Ghost','drone').model,'Ghost');
 for(const args of [['Ghost Robotics','Ghost','robot-dog'],['Anduril','Ghost-X','robot-dog'],['Anduril','Ghost Shark','drone'],['','Ghost','drone'],['Anduril','Ghost X unknown','drone'],['Anduril','E8:B4:70:C0:00:01','drone'],['Warhound','Warhound','robot-dog'],['Anduril','Warhound','robot-dog']])
  assert.equal(deviceReference(...args),null);
 assert.equal(modelWebsite('Ghost (Ghost-X)','Anduril','drone'),'https://armory.anduril.com/products/ghost-x');
 assert.equal(companyWebsite('Anduril Imaging'),'https://www.anduril.com/');
 assert.equal(companyWebsite('Warhound'),'https://warhound.com/');
 assert.equal(deviceManufacturer('Anduril customer'),null);
});
test('Warhound is a working-dog reference without a claimed radio signature',()=>{
 const m=deviceReferences.models.find(m=>m.vendor==='warhound');
 assert.deepEqual(m.kinds,[]);assert.match(m.category,/Working-dog/);
 assert.deepEqual(deviceManufacturer('Warhound').prefixes,[]);
 assert.match(m.description,/living working dogs/);
 assert.match(m.reception,/No verified/);
 assert.deepEqual(deviceManufacturer('Anduril').prefixes,['E8B470C']);
 assert.deepEqual(deviceManufacturer('Anduril Imaging').prefixes,['8C1F64763']);
});
