import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DATASETS,datasetFor,parseCsv,jsonCollections,pageRecords} from '../public/research-data-model.mjs';

test('CSV preview preserves prefixes, quoted newlines, commas and literal text',()=>{
 const data=parseCsv('\uFEFFprefix,registrant,notes\r\n001122,"Example, Inc.","a ""quote""\nnext line"\r\n000001,"<script>alert(1)</script>",=1+1\r\n');
 assert.deepEqual(data.rows,[['001122','Example, Inc.','a "quote"\nnext line'],['000001','<script>alert(1)</script>','=1+1']]);
 assert.throws(()=>parseCsv('a,b\n"unfinished,b'),/Unclosed/);
 assert.throws(()=>parseCsv('a,b\none,two,three'),/inconsistent/);
});

test('all published CSV rows and JSON collections can be browsed without clipping the file',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/downloads/data/manifest.json',import.meta.url)));
 for(const dataset of manifest.datasets.filter(d=>d.file.endsWith('.csv'))){
  const parsed=parseCsv(readFileSync(new URL('../public/downloads/data/'+dataset.file,import.meta.url),'utf8'));
  assert.equal(parsed.rows.length,dataset.rows);assert.deepEqual(parsed.headers,dataset.columns);
  const last=pageRecords(parsed.rows,'',1e8,25);assert.ok(last.rows.length<=25);assert.deepEqual(last.rows.at(-1),parsed.rows.at(-1));
 }
 const data=JSON.parse(readFileSync(new URL('../public/downloads/data/devices-global.json',import.meta.url)));
 const collections=jsonCollections(data);
 for(const name of ['devices','radio_allocations','remote_id_rules','rf_channels','vendor_flows'])assert.equal(collections.find(c=>c.id===name).rows.length,data[name].length);
 assert.equal(collections.find(c=>c.id==='cloud_services.services').rows.length,data.cloud_services.services.length);
 assert.equal(collections.find(c=>c.id==='robot_signatures.rules').rows.length,data.robot_signatures.rules.length);
 const found=pageRecords(collections.find(c=>c.id==='devices').rows,'Skydio',0,10);assert.ok(found.total>0);assert.ok(found.rows.every(r=>JSON.stringify(r).toLowerCase().includes('skydio')));
 assert.equal(pageRecords(data.devices,'never-a-matching-device-12345678',99,10).page,0);
});

test('library links open previews; downloads stay explicit and file selection is allowlisted',()=>{
 const html=readFileSync(new URL('../public/devices.html',import.meta.url),'utf8');
 for(const name of Object.keys(DATASETS))assert.ok(html.includes(`/research-data.html?file=${name}`));
 assert.ok(!/<a[^>]+download\b/.test(html));
 for(const name of ['__proto__','constructor','https://example.test/data','../private.json'])assert.equal(datasetFor(name),null);
});
