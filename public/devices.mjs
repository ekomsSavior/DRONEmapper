import {companyWebsite,modelWebsite} from './company-links.mjs';
import {libraryModels} from './device-library-model.mjs';
import {deviceReferences} from './security-device-references.mjs';
const $=id=>document.getElementById(id);
let models=libraryModels();
let inventoryStatus='Loading map inventory…';
let limit=60;
const make=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
function link(label,url){const a=make('a',label);if(/^https:\/\//.test(url))a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function filters(){
$('reference-category').length=1;$('reference-vendor').length=1;
for(const category of [...new Set(models.map(m=>m.category))].sort())$('reference-category').append(new Option(category,category));
for(const vendor of [...new Set(models.map(m=>m.maker))].sort())$('reference-vendor').append(new Option(vendor,vendor));
const selectedVendor=new URLSearchParams(location.search).get('vendor');if(selectedVendor)$('reference-vendor').value=selectedVendor;
}
filters();
$('reference-search').value=new URLSearchParams(location.search).get('model')||'';
function render(){
 const q=$('reference-search').value.trim().toLowerCase(),category=$('reference-category').value;
 const vendor=$('reference-vendor').value;
 const matches=models.filter(m=>(!vendor||m.maker===vendor)&&(!category||m.category===category)&&(!q||[m.maker,m.name,m.category,m.connection,m.description,m.reception,...m.aliases].join(' ').toLowerCase().includes(q)));
 $('reference-count').textContent=`${matches.length} of ${models.length} device / program entries · ${inventoryStatus}`;
 const list=$('reference-list');list.replaceChildren();
 for(const m of matches.slice(0,limit)){
  const card=make('article','','reference-card');
  card.append(make('p',m.maker+' · '+m.category,'eyebrow'),make('h2',m.name),make('p',m.description));
  if(m.records)card.append(make('p',`${m.records.toLocaleString()} map records · ${Object.entries(m.record_types).map(([k,v])=>`${k}: ${v}`).join(' · ')}`),make('p',m.operators.length?'Reported operators: '+m.operators.join(', '):''));
  const allocations=deviceReferences.vendors.filter(v=>[v.name,...(v.aliases||[])].some(n=>n.toLowerCase()===m.maker.toLowerCase())).flatMap(v=>(v.prefixes||[]).map(p=>`${p}… / ${p.length*4}-bit allocation`));
  card.append(make('p',allocations.length?'Manufacturer MAC allocation (not model-specific): '+allocations.join(' · '):'MAC allocation: not verified for this manufacturer.'));
  if(m.last_seen)card.append(make('p','Latest dated observation: '+new Date(m.last_seen*1000).toLocaleString()));
  const comms=make('p');comms.append(make('strong','Published communications: '),document.createTextNode(m.connection));card.append(comms,make('p',m.reception,'reference-reception'));
  const links=make('p');if(m.url)links.append(link('Product / program ↗',m.url));if(m.manufacturer_url)links.append(document.createTextNode(' · '),link('Manufacturer ↗',m.manufacturer_url));const cloud=make('a','Cloud Surface ↗');cloud.href='/cloud-surface?vendor='+encodeURIComponent(m.maker);const galaxy=make('a','Galaxy ↗');galaxy.href='/galaxy?vendor='+encodeURIComponent(m.maker);links.append(document.createTextNode(' · '),cloud,document.createTextNode(' · '),galaxy);card.append(links);
  if(m.specs&&Object.keys(m.specs).length){const specs=make('dl');for(const [k,v] of Object.entries(m.specs)){specs.append(make('dt',k.replaceAll('_',' ')),make('dd',typeof v==='object'?JSON.stringify(v):String(v)));}card.append(specs);}
  const evidence=make('details');evidence.append(make('summary','Reference details'));if(m.source)evidence.append(link('Published source ↗',m.source));
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
