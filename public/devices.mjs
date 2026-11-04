import {companyWebsite,modelWebsite} from './company-links.mjs';
import {libraryModels} from './device-library-model.mjs?v=20261101-robots';
import {macAllocationsFor,formatMacPrefix,macReviewedOn} from './device-mac-model.mjs';
import {systemBreakdown,includeReviewedSystemModels} from './device-system-model.mjs?v=20261103-systems-b46';
const $=id=>document.getElementById(id);
let models=includeReviewedSystemModels(libraryModels());
let inventoryStatus='Loading map inventory…';
let limit=60;
const make=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
const systems=new WeakMap();
function systemFor(model){if(!systems.has(model))systems.set(model,systemBreakdown(model));return systems.get(model);}
function componentText(model){return Object.values(systemFor(model).sections).flatMap(s=>s.facts.map(f=>f.component+' '+f.details)).join(' ');}
function link(label,url){const a=make('a',label);if(/^https:\/\//.test(url))a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function systemPanel(model){
 const system=systemFor(model),panel=make('details','','system-breakdown');
 panel.append(make('summary','System breakdown'));
 for(const config of system.configurations)panel.append(make('p',config.configuration+' Reviewed '+config.reviewed_on+'.','system-configuration'));
 if(system.record_scope==='unidentified-model')panel.append(make('p','This entry groups records without an identified model; a component list cannot be assigned to it.'));
 if(system.record_scope==='software-platform'||system.record_scope==='program-or-family')panel.append(make('p','This is a platform, program or family reference. Hardware depends on the selected device and configuration.'));
 for(const [key,section] of Object.entries(system.sections)){
  if(key==='other'&&!section.facts.length)continue;
  const group=make('section','','system-section');group.append(make('h3',section.title));
  if(!section.facts.length)group.append(make('p','Not established in this catalog.','system-missing'));
  for(const fact of section.facts){
   const row=make('div','','system-fact');row.append(make('strong',fact.component),make('p',fact.details));
   if(fact.configuration&&!fact.profile_id)row.append(make('p',fact.configuration,'system-configuration'));
   if(fact.pattern){const detail=make('details');detail.append(make('summary','Exact firmware pattern'),make('pre',JSON.stringify(fact.pattern,null,2)));row.append(detail);}
   const sources=make('p','','system-sources');
   fact.sources.forEach((url,i)=>{if(i)sources.append(document.createTextNode(' · '));sources.append(link('Source '+(i+1)+' ↗',url));});
   sources.append(document.createTextNode(' · '+fact.evidence.replaceAll('-',' ')));row.append(sources);group.append(row);
  }
  panel.append(group);
 }
 panel.append(make('p',system.identification_note,'reference-reception'));
 return panel;
}
function filters(){
$('reference-category').length=1;$('reference-vendor').length=1;
for(const category of [...new Set(models.map(m=>m.category))].sort())$('reference-category').append(new Option(category,category));
for(const vendor of [...new Set(models.map(m=>m.maker))].sort())$('reference-vendor').append(new Option(vendor,vendor));
const selectedVendor=new URLSearchParams(location.search).get('vendor');if(selectedVendor)$('reference-vendor').value=selectedVendor;
}
filters();
$('reference-search').value=new URLSearchParams(location.search).get('model')||(location.hash==='#warhound'?'Warhound':'');
function render(){
 const q=$('reference-search').value.trim().toLowerCase(),category=$('reference-category').value;
 const vendor=$('reference-vendor').value;
 const matches=models.filter(m=>(!vendor||m.maker===vendor)&&(!category||m.category===category)&&(!q||[m.maker,m.name,m.category,m.connection,m.description,m.reception,...m.aliases,componentText(m)].join(' ').toLowerCase().includes(q)));
 $('reference-count').textContent=`${matches.length} of ${models.length} device / program entries · ${inventoryStatus}`;
 const list=$('reference-list');list.replaceChildren();
 for(const m of matches.slice(0,limit)){
  const card=make('article','','reference-card');
  card.append(make('p',m.maker+' · '+m.category,'eyebrow'),make('h2',m.name),make('p',m.description));
  if(m.records)card.append(make('p',`${m.records.toLocaleString()} map records · ${Object.entries(m.record_types).map(([k,v])=>`${k}: ${v}`).join(' · ')}`),make('p',m.operators.length?'Reported operators: '+m.operators.join(', '):''));
  const allocations=macAllocationsFor(m.maker);
  card.append(make('p',allocations.length?'Manufacturer MAC prefixes: '+allocations.map(formatMacPrefix).join(' · '):m.maker==='Unknown manufacturer'?'MAC prefix: manufacturer not identified in the source record.':'MAC prefix: no verified match in the reviewed registries.'));
  if(allocations.length){
   const registrations=make('details');registrations.append(make('summary','MAC registration sources'));
   registrations.append(make('p',`Manufacturer allocations; use on this particular model is not verified. Reviewed ${macReviewedOn}.`));
   for(const allocation of allocations){const row=make('p');row.append(link(formatMacPrefix(allocation)+' · '+allocation.registrant,allocation.source));registrations.append(row);}
   card.append(registrations);
  }
  if(m.last_seen)card.append(make('p','Latest dated observation: '+new Date(m.last_seen*1000).toLocaleString()));
  const processors=systemFor(m).sections.compute.facts;
  if(processors.length)card.append(make('p','Documented compute: '+processors.map(f=>f.component).join(' · '),'system-compute'));
  card.append(systemPanel(m));
  const radioFacts=systemFor(m).sections.radios.facts.filter(f=>f.evidence==='reviewed-primary-source');
  const communications=radioFacts.length&&/not (?:yet )?verified|not established|unknown/i.test(m.connection||'')?radioFacts.map(f=>f.component).join(' · '):m.connection;
  const comms=make('p');comms.append(make('strong','Published communications: '),document.createTextNode(communications));card.append(comms,make('p',m.reception,'reference-reception'));
  const links=make('p');if(m.url)links.append(link('Product / program ↗',m.url));if(m.manufacturer_url)links.append(document.createTextNode(' · '),link('Manufacturer ↗',m.manufacturer_url));const cloud=make('a','Cloud Surface ↗');cloud.href='/cloud-surface?vendor='+encodeURIComponent(m.maker);const galaxy=make('a','Galaxy ↗');galaxy.href='/galaxy?vendor='+encodeURIComponent(m.maker);links.append(document.createTextNode(' · '),cloud,document.createTextNode(' · '),galaxy);card.append(links);
  if(m.specs&&Object.keys(m.specs).length){const specs=make('dl');for(const [k,v] of Object.entries(m.specs)){specs.append(make('dt',k.replaceAll('_',' ')),make('dd',typeof v==='object'?JSON.stringify(v):String(v)));}card.append(specs);}
  const evidence=make('details');evidence.append(make('summary','Reference details'));if(m.source)evidence.append(link('Published source ↗',m.source));if(m.reference_notes)evidence.append(make('p',m.reference_notes));
  for(const related of m.related_links||[])evidence.append(document.createTextNode(' · '),link(related.name+' ↗',related.url));
  card.append(evidence);list.append(card);
 }
 if(matches.length>limit){const more=make('button','Show more devices');more.onclick=()=>{limit+=60;render();};list.append(more);}
 if(!matches.length)list.append(make('p','No matching reference. Try a product family or another category.'));
}
$('reference-vendor').addEventListener('change',render);
$('reference-search').addEventListener('input',render);$('reference-category').addEventListener('change',render);render();

async function loadInventory(){
 try{
  let response=await fetch('/api/device-library');
  if(!response.ok)response=await fetch('/device-inventory.json');
  if(!response.ok)throw new Error('Inventory unavailable');
  const inventory=await response.json();if(!Array.isArray(inventory.models))throw new Error('Invalid inventory');
  for(const row of inventory.models){
   const known=models.find(m=>m.maker.toLowerCase()===row.maker.toLowerCase()&&[m.name,...m.aliases].some(n=>n.toLowerCase()===row.name.toLowerCase()));
   if(known){known.records=(known.records||0)+row.records;known.record_types||={};for(const [type,count] of Object.entries(row.record_types))known.record_types[type]=(known.record_types[type]||0)+count;known.last_seen=Math.max(known.last_seen||0,row.last_seen||0);known.operators=[...new Set([...(known.operators||[]),...row.operators])];continue;}
   models.push({...row,aliases:[],description:row.name==='Unknown model'?'Map records without a verified model. These are grouped records, not one identified device.':`Reported in map data${row.domains.length?' · '+row.domains.join(', '):''}.`,connection:'Model-specific communications not yet verified.',reception:'A map record does not establish a scanner signature.',url:modelWebsite(row.name,row.maker,row.category),manufacturer_url:companyWebsite(row.maker)});
  }
  models.sort((a,b)=>a.maker.localeCompare(b.maker)||a.name.localeCompare(b.name));
  inventoryStatus='Map inventory updated '+new Date(inventory.generated_at*1000).toLocaleString();filters();render();
 }catch{inventoryStatus='Map inventory temporarily unavailable · showing curated references';render();}
}
loadInventory();
