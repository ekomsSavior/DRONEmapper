import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policePortalFor} from '../public/police-portals.mjs';
test('every named map dependency exists before browser startup',async()=>{
 const source=readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
 for(const [,names,path] of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)){
  const module=await import(new URL('../public/'+path,import.meta.url));
  for(const name of names.split(',').map(s=>s.trim().split(/\s+as\s+/)[0]))assert(name in module,`${path} must export ${name}`);
 }
});
test('police portal matching retains geographic and device checks',()=>{
 const r={operator:'Elk Grove Police Department',purpose:'public-safety',kind:'drone',latitude:38.4,longitude:-121.4};
 assert.match(policePortalFor(r).url,/aerodome/);
 assert.equal(policePortalFor({...r,kind:'robot-dog'}),null);
 assert.equal(policePortalFor({...r,latitude:0}),null);
});
