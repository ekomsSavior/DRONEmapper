import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {aircraftReference,aircraftReferences} from '../public/aircraft-references.mjs';
import {companyWebsite,modelWebsite} from '../public/company-links.mjs';
test('GA reference exact matches never guess a variant or classify a radio',()=>{
 assert.equal(aircraftReference('General Atomics','Q9').model,'MQ-9 family');
 assert.deepEqual(aircraftReference('General Atomics','Q9').specs,{});
 assert.equal(aircraftReference('GA-ASI','MQ-9B SeaGuardian').id,'ga-mq9b-sea');
 for(const [maker,model,kind] of [['Other','Q9','drone'],['General Atomics','Q9 unknown','drone'],['General Atomics','Q9','ground-robot'],['','MQ-9A','drone']])assert.equal(aircraftReference(maker,model,kind),null);
 assert.equal(modelWebsite('Gray Eagle 25M','General Atomics','drone'),'https://www.ga-asi.com/remotely-piloted-aircraft/gray-eagle-25m');
 assert.match(companyWebsite('GA-ASI'),/^https:\/\/www.ga-asi.com/);
});
test('offline scanner and website references use the same reviewed catalog',()=>{
 const canonical=JSON.parse(fs.readFileSync('integration/aircraft-references.json'));
 assert.deepEqual(aircraftReferences,canonical);assert.equal(canonical.models.length,29);
 for(const file of ['android-node/app/src/main/assets/aircraft-references.json','linux-node/dronemapper_node/data/aircraft-references.json'])assert.deepEqual(JSON.parse(fs.readFileSync(file)),canonical);
 for(const m of canonical.models)assert.ok(m.sources.length&&m.reception.includes('No proprietary'));
});
