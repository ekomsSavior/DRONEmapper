import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryModels} from '../public/device-library-model.mjs';
import {deviceReference,deviceManufacturer} from '../public/security-device-references.mjs';
import {buildGalaxy} from '../public/galaxy-model.mjs';
import {historicalMilestones} from '../worker/reviewed-history.mjs';
test('broad library preserves existing vendors and includes Flock without radio inference',()=>{
 const rows=libraryModels();
 for(const name of ['Flock Safety','Anduril Industries','Skydio','General Atomics'])assert(rows.some(m=>m.maker===name),name);
 for(const r of rows){assert(r.name&&r.category&&r.maker&&r.reception);assert.equal(new URL(r.source).protocol,'https:');}
 assert.equal(deviceReference('Flock Safety','Alpha','drone').model,'Alpha');
 assert.equal(deviceReference('DJI','Alpha','drone'),null);
 assert.equal(deviceReference('Flock Safety','Aerodome DFR','drone'),null);
 assert.deepEqual(deviceManufacturer('Flock Safety').prefixes,[]);
});
test('Flock galaxy integrates without replacing previous relationships',()=>{
 const g=buildGalaxy();
 for(const [a,b] of [['skydio','fusus'],['brinc','airdata'],['flock-os','flock-aerodome']])assert(g.edges.some(e=>e.from===a&&e.to===b));
 assert.equal(g.nodes.filter(n=>n.type==='service').length,27);
});
test('Flock program records have historical times, not invented live positions',()=>{
 const rows=historicalMilestones.filter(r=>r.id.startsWith('milestone:flock-'));
 assert.equal(rows.length,3);
 for(const r of rows){assert.equal(r.record_type,'historical');assert.equal(r.observed_at,null);assert.equal(r.position_basis,'reported-area');assert.equal(r.manufacturer,null);assert.equal(r.model,null);}
});
