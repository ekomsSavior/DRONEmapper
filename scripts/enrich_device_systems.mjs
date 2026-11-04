// Shared composition for website cards and every exported catalog record.
import fs from 'node:fs';
import {systemBreakdown} from '../public/device-system-model.mjs';
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
const bands=JSON.parse(fs.readFileSync(new URL('../integration/rf-channels.json',import.meta.url),'utf8')).channels;
process.stdout.write(JSON.stringify(rows.map(row=>{
 const system=systemBreakdown(row);
 const facts=system.sections.radios.facts.filter(f=>f.evidence==='reviewed-primary-source');
 const ids=new Set(system.configurations.map(c=>c.id));
 const channels=bands.filter(b=>(b.system_profile_ids||'').split(';').some(id=>ids.has(id)));
 return {...row,system_breakdown:system,rf_information:[...row.rf_information,
  ...facts.map(f=>({kind:'system-radio-reference',...f,scope:'Published configuration only; not a received observation or a unique scanner signature'})),
  ...(channels.length?[{kind:'model-frequency-reference',channels,scope:'Exact reviewed system profile; regional and hardware configuration constraints apply'}]:[])]};
})));
