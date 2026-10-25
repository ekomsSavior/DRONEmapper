import fs from 'node:fs';
import {companyWebsite,modelWebsite} from '../public/company-links.mjs';
const file=process.argv[2];if(!file)throw Error('Supply a saved public feed JSON');
const feed=JSON.parse(fs.readFileSync(file));if(feed.schema_version!==2)throw Error('Expected map feed schema 2');
const vendors=new Map();let unattributed=0;
for(const r of [...feed.tracks,...feed.activity]){const name=r.manufacturer?.trim();if(!name){unattributed++;continue;}if(!vendors.has(name))vendors.set(name,{id:'map-vendor:'+name,name,url:companyWebsite(name),records:0,kinds:[],models:[]});const v=vendors.get(name);v.records++;if(!v.kinds.includes(r.kind))v.kinds.push(r.kind);if(r.model&&!v.models.some(m=>m.name===r.model&&m.kind===r.kind))v.models.push({name:r.model,kind:r.kind,url:modelWebsite(r.model,name,r.kind)});}
const data={schema_version:1,reviewed_on:'2026-10-25',source:'https://dronemapper.churchofmalware.org/feed?hours=0',unattributed_records:unattributed,vendors:[...vendors.values()].sort((a,b)=>a.name.localeCompare(b.name))};
fs.writeFileSync('integration/map-vendors.json',JSON.stringify(data,null,2)+'\n');fs.writeFileSync('public/map-vendor-data.mjs','export const mapVendors = '+JSON.stringify(data)+';\n');console.log(data.vendors.length+' manufacturer names inventoried');
