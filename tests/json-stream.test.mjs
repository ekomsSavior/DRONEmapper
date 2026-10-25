import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {jsonByteStream} from '../worker/json-stream.mjs';

test('streamed JSON retains Unicode, escaped fields, empty arrays and omitted values',async()=>{
 const original={schema_version:2,absent:undefined,tracks:[],activity:[{name:'"quoted"\n\\text',value:'x'.repeat(16331)+'🛰️'.repeat(30000)},undefined,null],collection:{available:0}};
 const reader=jsonByteStream(original).getReader({mode:'byob'}),decoder=new TextDecoder();let text='';
 while(true){const {done,value}=await reader.read(new Uint8Array(65536));if(value)text+=decoder.decode(value,{stream:!done});if(done)break;}
 text+=decoder.decode();assert.deepEqual(JSON.parse(text),JSON.parse(JSON.stringify(original)));
});

test('map and export responses cross the Workers RPC 32 MiB limit without dropping records',async()=>{
 const root=new URL('../',import.meta.url).pathname;
 const compiled=await build({stdin:{contents:`
 import {ActivityStore} from './worker/index.mjs';
 const records=Array.from({length:30000},(_,i)=>({id:'flight-'+i,name:'🛰️'.repeat(300),flight_date:'2025-01-01',live:false}));
 export class TestStore extends ActivityStore{
  async snapshot(){return {schema_version:2,server_time:1,tracks:[],activity:[...records],collection:{available:1}};}
  async export(){return {attribution:'Test fixture',records};}
 }
 export default {async fetch(r,env){
  const store=env.ACTIVITY.getByName('test'),path=new URL(r.url).pathname;
  if(path==='/legacy'){try{await store.snapshot();return new Response('Unexpected success');}catch(e){return new Response(e.message,{status:500});}}
  if(path==='/export')return store.exportResponse('police-flights',r.method==='HEAD');
  return store.feedResponse(0,{tracks:[{id:'node-position'}],signals:[{id:'node-signal'}],nodes:{enabled:true}},r.method==='HEAD');
 }};`,resolveDir:root,sourcefile:'stream-test.mjs'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*']});
 const mf=new Miniflare({workers:[{config:{name:'stream-test',compatibilityDate:'2026-10-15',compatibilityFlags:['nodejs_compat'],manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:compiled.outputFiles[0].text}}},exports:{TestStore:{type:'durable-object',storage:'sqlite'}},env:{ACTIVITY:{type:'durable-object',worker:'stream-test',exportName:'TestStore'}}}}]});
 try{
  const legacy=await mf.dispatchFetch('https://stream.test/legacy');assert.equal(legacy.status,500);assert.match(await legacy.text(),/32|large|limit/i);
  const result=await mf.dispatchFetch('https://stream.test/feed');assert.equal(result.status,200);assert.match(result.headers.get('Content-Type'),/application\/json/);assert.equal(result.headers.get('Cache-Control'),'no-store');
  const data=await result.json();assert.equal(data.activity.length,30001);assert.equal(data.activity[29999].id,'flight-29999');assert.equal(data.activity[0].name,'🛰️'.repeat(300));assert.equal(data.activity[0].live,false);assert.equal(data.activity[0].flight_date,'2025-01-01');assert.equal(data.tracks[0].id,'node-position');assert.equal(data.nodes.enabled,true);
  const exported=await mf.dispatchFetch('https://stream.test/export');assert.equal(exported.status,200);assert.equal((await exported.json()).records.length,30000);
  const head=await mf.dispatchFetch('https://stream.test/feed',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 }finally{await mf.dispose();}
});
