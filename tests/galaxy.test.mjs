import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGalaxy} from '../public/galaxy-model.mjs';
import {cloudSurfaces} from '../public/cloud-surface-data.mjs';
test('galaxy relationships resolve to unique nodes with evidence',()=>{const g=buildGalaxy(),ids=new Set(g.nodes.map(n=>n.id));assert.equal(ids.size,g.nodes.length);for(const e of g.edges){assert(ids.has(e.from)&&ids.has(e.to));assert.equal(new URL(e.source).protocol,'https:');}assert.equal(g.nodes.filter(n=>n.type==='service').length,cloudSurfaces.services.length);});
test('protocol similarity does not invent cross-vendor links',()=>{const subset={services:cloudSurfaces.services.filter(s=>['dji','inorbit'].includes(s.id))};const g=buildGalaxy(subset);assert(!g.edges.some(e=>e.from==='dji'&&e.to==='inorbit'));assert(!g.edges.some(e=>!g.nodes.some(n=>n.id===e.from)));});
