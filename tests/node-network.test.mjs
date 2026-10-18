import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {randomUUID} from 'node:crypto';
const root=new URL('../',import.meta.url).pathname;
const compiled=await build({stdin:{contents:`export {NodeNetwork} from './worker/node-network.mjs'; export default {async fetch(r,env){const n=env.NODES.getByName('test');return new URL(r.url).pathname==='/snapshot'?Response.json(await n.snapshot(0)):n.fetch(r);}}`,resolveDir:root,sourcefile:'isolated-node-test.mjs'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
const admin='isolated-test-admin-secret-0000000000000000';
test('Durable Object enrollment, actual upload receipts, private storage projection and revocation',async()=>{
 const mf=new Miniflare({workers:[{config:{name:'test',compatibilityDate:'2026-10-15',manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:compiled.outputFiles[0].text}}},exports:{NodeNetwork:{type:'durable-object',storage:'sqlite'}},env:{NODES:{type:'durable-object',worker:'test',exportName:'NodeNetwork'},NODE_INGEST_ENABLED:{type:'json',value:'true'},NODE_ADMIN_TOKEN:{type:'json',value:admin}}}}]});
 try{
 const post=(path,body,token=admin,headers={})=>mf.dispatchFetch('https://node.test'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await post('/v1/admin/nodes',{},'bad')).status,401);
 const enrolled=await post('/v1/admin/nodes',{});assert.equal(enrolled.status,201);
 const {node_key:token,node_handle}=await enrolled.json(),node_id=randomUUID(),now=Date.now()/1000;
 const event={event_id:randomUUID(),observation_type:'wifi-candidate',candidate_id:randomUUID(),signature:'wifi-cam-name',frequency_mhz:2412,latitude:37.125,longitude:-122.125,location_grid_degrees:.01,observed_at:now,received_at:now};
 const payload={schema_version:1,node_id,observations:[event]};
 assert.equal((await post('/v1/observations',payload,token,{Origin:'https://unrelated.test'})).status,403);
 assert.equal((await post('/v1/observations',{...payload,observations:[{...event,ssid:'private'}]},token)).status,422);
 assert.equal((await post('/v1/observations','x'.repeat(65537),token)).status,413);
 assert.deepEqual(await (await post('/v1/observations',payload,token)).json(),{schema_version:1,accepted:1,duplicates:0});
 assert.deepEqual(await (await post('/v1/observations',payload,token)).json(),{schema_version:1,accepted:0,duplicates:1});
 assert.equal((await post('/v1/nodes/heartbeat',{schema_version:1,node_id:randomUUID()},token)).status,403);
 const snap=await (await mf.dispatchFetch('https://node.test/snapshot')).json();
 assert.equal(snap.nodes.active_nodes,1);assert.equal(snap.signals.length,1);assert.equal(snap.tracks.length,0);
 const serialized=JSON.stringify(snap);for(const secret of [token,node_id,node_handle,event.candidate_id,event.event_id])assert.equal(serialized.includes(secret),false);
 assert.equal(snap.signals[0].node_online,true);
 const adsb={event_id:randomUUID(),observation_type:'adsb-uas',protocol:'adsb',icao:'abc123',category:'B6',latitude:37.1,longitude:-122.1,observed_at:now,received_at:now};
 assert.equal((await post('/v1/observations',{schema_version:1,node_id,observations:[{...adsb,category:'A3'}]},token)).status,422);
 assert.deepEqual(await (await post('/v1/observations',{schema_version:1,node_id,observations:[adsb]},token)).json(),{schema_version:1,accepted:1,duplicates:0});
 const decoded=await (await mf.dispatchFetch('https://node.test/snapshot')).json();
 assert.equal(decoded.tracks.length,1);assert.equal(decoded.tracks[0].protocol,'adsb');assert.match(decoded.tracks[0].id,/^adsb-/);
 assert.equal(JSON.stringify(decoded).includes('abc123'),false);

 assert.equal((await post('/v1/admin/revoke',{node_handle})).status,200);
 assert.equal((await post('/v1/observations',payload,token)).status,401);
 assert.equal((await (await mf.dispatchFetch('https://node.test/snapshot')).json()).signals.length,0);
 }finally{await mf.dispose();}
});
