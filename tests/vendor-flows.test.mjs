import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {vendorFlow} from '../public/vendor-flow-model.mjs';import {researchInventory,servicesForVendor} from '../public/map-device-coverage.mjs';
test('Anduril aliases resolve to the same evidenced flow and include researched products',()=>{assert.deepEqual(vendorFlow('Anduril').edges,vendorFlow('Anduril Industries').edges);const rows=researchInventory(JSON.parse(fs.readFileSync(new URL('../public/device-inventory.json',import.meta.url))).models);assert.equal(rows.filter(m=>m.maker==='Anduril Industries'&&m.reference).length,31);assert.ok(servicesForVendor('Anduril Industries').some(s=>s.id==='lattice'));const g=vendorFlow('Anduril');assert.equal(g.nodes.length,7);assert.ok(g.edges.some(e=>e.to==='objects'&&e.label==='REST'));assert.ok(g.edges.some(e=>e.label==='Internal gRPC / Protobuf'));assert.ok(!g.edges.some(e=>/Ghost|Bolt/.test(e.from)));});
test('unresearched vendors receive no invented architecture',()=>{assert.equal(vendorFlow('Unresearched vendor').edges.length,0);assert.equal(vendorFlow('Unresearched vendor').complete,false);});
test('branched paths do not run through unrelated component nodes',()=>{
 for(const vendor of ['OhmniLabs','HAI Robotics','Burro','OTTO Motors']){
  const graph=vendorFlow(vendor);assert.ok(graph.edges.length,vendor);
  for(const e of graph.edges){const a=graph.nodes.find(n=>n.id===e.from),b=graph.nodes.find(n=>n.id===e.to);
   for(const n of graph.nodes.filter(n=>n.id!==a.id&&n.id!==b.id)){
    const dx=b.x-a.x,dy=b.y-a.y,t=((n.x-a.x)*dx+(n.y-a.y)*dy)/(dx*dx+dy*dy);
    if(t>0&&t<1)assert.ok(Math.hypot(n.x-a.x-t*dx,n.y-a.y-t*dy)>25,vendor+': '+n.name);
   }
  }
 }
});
test('inventory naming variants resolve only to explicitly sourced service scopes',()=>{
 for(const [name,id] of [['Wing','wing-network'],['Caterpillar Mining','cat-command'],['Komatsu Mining','komatsu-frontrunner']]){
  const service=servicesForVendor(name).find(s=>s.id===id);assert.ok(service,name);
  const mapping=service.map_vendor_names.find(n=>n.name===name);assert.equal(new URL(mapping.source).protocol,'https:');assert.ok(mapping.scope);
  assert.ok(vendorFlow(name).edges.length,name);
 }
 assert.equal(servicesForVendor('Unrelated Mining').length,0);
});
test('all documented vendor flows have resolvable edges and primary-source links',()=>{for(const v of ['Anduril','Unitree Robotics','DEEP Robotics','Ghost Robotics','Waymo','1X Technologies','6 River Systems','Parrot','ANYbotics','Boston Dynamics','Flock Safety','Clearpath Robotics / OTTO Motors']){const g=vendorFlow(v),ids=new Set(g.nodes.map(n=>n.id));assert.ok(g.edges.length);for(const e of g.edges){assert.ok(ids.has(e.from)&&ids.has(e.to));assert.equal(new URL(e.source).protocol,'https:');}}});

test('every researched vendor renders its source-backed hops, including platform-only vendors',async()=>{
 const {cloudSurfaces}=await import('../public/cloud-surface-data.mjs');
 for(const vendor of new Set(cloudSurfaces.services.map(s=>s.vendor))){
  const graph=vendorFlow(vendor),ids=new Set(graph.nodes.map(n=>n.id));assert.ok(graph.edges.length,vendor);
  for(const edge of graph.edges){assert.ok(ids.has(edge.from)&&ids.has(edge.to),vendor);assert.equal(new URL(edge.source).protocol,'https:');}
 }
 const tesla=vendorFlow('Tesla');assert.ok(tesla.edges.some(e=>/TLS|WebSocket/.test(e.label)&&!e.directionUnverified));
 const starship=vendorFlow('Starship Technologies');assert.ok(starship.edges.some(e=>e.bidirectional));
});
test('connection evidence cannot silently create absent hops or assert unspecified direction',async()=>{
 const {serviceConnections}=await import('../public/service-connections.mjs');
 const base={id:'fixture',path:['Robot','Relay','Client'],source:'https://example.org/docs',data:'Telemetry',access:'Authorized'};
 assert.ok(serviceConnections(base).every(e=>e.directionUnverified&&!e.bidirectional));
 const explicit={...base,links:[{from_index:0,to_index:2,label:'Direct telemetry',source:base.source,direction:'forward'}]};
 const hops=serviceConnections(explicit);assert.equal(hops.length,1);assert.equal(hops[0].to_index,2);assert.equal(hops[0].directionUnverified,false);
 assert.throws(()=>serviceConnections({...explicit,links:[{...explicit.links[0],to_index:3}]}),/Invalid path/);
 assert.throws(()=>serviceConnections({...explicit,links:[{...explicit.links[0],direction:undefined}]}),/Missing connection evidence/);
});
