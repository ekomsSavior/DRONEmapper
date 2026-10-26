import {cloudSurfaces} from './cloud-surface-data.mjs?v=20261026-networks-260';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
// A protocol established by a source outranks a mention in an unknowns note.
const searchRank=(s,q)=>!q?0:s.protocols.join(' ').toLowerCase().includes(q)?3:[s.vendor,s.name].join(' ').toLowerCase().includes(q)?2:[s.category,s.hosting,...s.path,s.data].join(' ').toLowerCase().includes(q)?1:0;
for(const c of [...new Set(cloudSurfaces.services.map(s=>s.category))].sort())$('cloud-category').append(new Option(c,c));
for(const h of [...new Set(cloudSurfaces.services.map(s=>s.hosting))].sort())$('cloud-hosting').append(new Option(h,h));
function render(){
 const q=$('cloud-search').value.trim().toLowerCase(),category=$('cloud-category').value,hosting=$('cloud-hosting').value;
 const rows=cloudSurfaces.services.filter(s=>(!category||s.category===category)&&(!hosting||s.hosting===hosting)&&(!q||JSON.stringify(s).toLowerCase().includes(q))).sort((a,b)=>searchRank(b,q)-searchRank(a,q));
 $('cloud-count').textContent=`${rows.length} of ${cloudSurfaces.services.length} documented services · reviewed ${cloudSurfaces.reviewed_on}`;
 $('cloud-list').replaceChildren();
 for(const s of rows){
  const card=el('article','');card.className='reference-card';card.append(el('p',s.vendor+' · '+s.category),el('h2',s.name),el('p',s.hosting));
  const path=el('ul','');path.setAttribute('aria-label','Documented components');for(const step of s.path)path.append(el('li',step));card.append(path);
  for(const [label,value] of [['Protocols',s.protocols.join(' · ')],['Available data',s.data],['Access',s.access],['Useful to contributors',s.useful],['Unknowns',s.gap]]){const p=el('p','');p.append(el('strong',label+': '),document.createTextNode(value));card.append(p);}
  const a=el('a','Official documentation ↗');a.href=s.source;a.target='_blank';a.rel='noopener noreferrer';card.append(a,el('p',s.connector));for(const link of s.related||[]){const a=el('a',link.name+' ↗');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';const p=el('p','');p.append(a);card.append(p);}$('cloud-list').append(card);
 }
 if(!rows.length)$('cloud-list').append(el('p','No matching service. Try another vendor or protocol.'));
}
$('cloud-hosting').addEventListener('change',render);
$('cloud-search').addEventListener('input',render);$('cloud-category').addEventListener('change',render);render();

// Shared map coverage augments, rather than replaces, documented service paths.
import {loadMapInventory,servicesForVendor,vendorInventory,deviceLinks,researchInventory} from './map-device-coverage.mjs?v=20261026-networks-260';
const coverage=el('section','');coverage.className='reference-feature';coverage.id='map-device-coverage';
coverage.append(el('h2','Map device coverage'));
const search=el('input','');search.type='search';search.placeholder='Find a manufacturer or model';search.setAttribute('aria-label','Search map device coverage');
const status=el('p','Loading map models…'),cards=el('div','');const controls=el('div','');controls.className='reference-controls';const searchLabel=el('label','Search mapped devices');searchLabel.append(search);controls.append(searchLabel);coverage.append(controls,status,cards);$('cloud-list').after(coverage);
loadMapInventory().then(data=>{
 const limits={documented:12,pending:12};const vendors=vendorInventory(researchInventory(data.models));search.value=new URLSearchParams(location.search).get('vendor')||'';
 function show(){const q=search.value.trim().toLowerCase(),serviceQuery=$('cloud-search').value.trim().toLowerCase(),category=$('cloud-category').value,hosting=$('cloud-hosting').value;
  const rows=vendors.filter(([v,models])=>{const names=[v,...models.map(m=>m.name)].join(' ').toLowerCase(),services=servicesForVendor(v);return names.includes(q)&&(services.length?services.some(s=>(!category||s.category===category)&&(!hosting||s.hosting===hosting)&&(!serviceQuery||names.includes(serviceQuery)||JSON.stringify(s).toLowerCase().includes(serviceQuery))):!category&&!hosting&&names.includes(serviceQuery));});
  rows.sort(([a],[b])=>Math.max(0,...servicesForVendor(b).map(s=>searchRank(s,serviceQuery)))-Math.max(0,...servicesForVendor(a).map(s=>searchRank(s,serviceQuery))));
  cards.replaceChildren();status.textContent=`${rows.length} matching manufacturers / unknown groups · ${data.models.length} map model groups`;
  for(const [key,title,entries] of [['documented','Vendors with documented services',rows.filter(([v])=>servicesForVendor(v).length)],['pending','Still researching',rows.filter(([v])=>!servicesForVendor(v).length)]]){
   if(!entries.length)continue;
   const section=el('section',''),grid=el('div','');grid.className='reference-grid';section.append(el('h3',title),el('p',entries.length+' manufacturer / unknown groups'),grid);cards.append(section);
  for(const [vendor,models] of entries.slice(0,limits[key])){const card=el('article','');card.className='reference-card';card.append(el('h2',vendor),el('p',`${models.length} model groups · ${models.reduce((n,m)=>n+m.records,0).toLocaleString()} map records`));
   const services=servicesForVendor(vendor);card.append(el('p',services.length?'Documented vendor services: '+services.map(s=>s.name).join(', ')+'. Model-specific participation requires separate evidence.':'Cloud service and model-specific communications not yet verified.'));
   const details=el('details','');details.append(el('summary','Models in the map'));for(const row of models){const p=el('p',row.name+' · '+row.category+' · ');const a=el('a','Device details ↗');a.href=deviceLinks(row).library;p.append(a);details.append(p);}card.append(details);
   const a=el('a',services.length?'Explore vendor galaxy ↗':'View device references ↗');a.href=services.length?deviceLinks(models[0]).galaxy:deviceLinks(models[0]).library;card.append(a);grid.append(card);
  }
  if(entries.length>limits[key]){const more=el('button',key==='documented'?'Show more documented vendors':'Show more vendors still being researched');more.onclick=()=>{limits[key]+=12;show();};section.append(more);}
  }
 }
 const refresh=()=>{limits.documented=12;limits.pending=12;show();};search.oninput=refresh;for(const [id,event]of [['cloud-search','input'],['cloud-category','change'],['cloud-hosting','change']])$(id).addEventListener(event,refresh);show();
}).catch(()=>status.textContent='Map coverage is temporarily unavailable. Documented services remain above.');
