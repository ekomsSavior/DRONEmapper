import {cloudSurfaces} from './cloud-surface-data.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
for(const c of [...new Set(cloudSurfaces.services.map(s=>s.category))].sort())$('cloud-category').append(new Option(c,c));
for(const h of [...new Set(cloudSurfaces.services.map(s=>s.hosting))].sort())$('cloud-hosting').append(new Option(h,h));
function render(){
 const q=$('cloud-search').value.trim().toLowerCase(),category=$('cloud-category').value,hosting=$('cloud-hosting').value;
 const rows=cloudSurfaces.services.filter(s=>(!category||s.category===category)&&(!hosting||s.hosting===hosting)&&(!q||JSON.stringify(s).toLowerCase().includes(q)));
 $('cloud-count').textContent=`${rows.length} of ${cloudSurfaces.services.length} documented services · reviewed ${cloudSurfaces.reviewed_on}`;
 $('cloud-list').replaceChildren();
 for(const s of rows){
  const card=el('article','');card.className='reference-card';card.append(el('p',s.vendor+' · '+s.category),el('h2',s.name),el('p',s.hosting));
  const path=el('ol','');path.setAttribute('aria-label','Documented communications path');for(const step of s.path)path.append(el('li',step));card.append(path);
  for(const [label,value] of [['Protocols',s.protocols.join(' · ')],['Available data',s.data],['Access',s.access],['Useful to contributors',s.useful],['Unknowns',s.gap]]){const p=el('p','');p.append(el('strong',label+': '),document.createTextNode(value));card.append(p);}
  const a=el('a','Official documentation ↗');a.href=s.source;a.target='_blank';a.rel='noopener noreferrer';card.append(a,el('p',s.connector));for(const link of s.related||[]){const a=el('a',link.name+' ↗');a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';const p=el('p','');p.append(a);card.append(p);}$('cloud-list').append(card);
 }
 if(!rows.length)$('cloud-list').append(el('p','No matching service. Try another vendor or protocol.'));
}
$('cloud-hosting').addEventListener('change',render);
$('cloud-search').addEventListener('input',render);$('cloud-category').addEventListener('change',render);render();

// Shared map coverage augments, rather than replaces, documented service paths.
import {loadMapInventory,servicesForVendor,vendorInventory,deviceLinks} from './map-device-coverage.mjs';
const coverage=el('section','');coverage.className='reference-feature';coverage.id='map-device-coverage';
coverage.append(el('h2','Map device coverage'));
const search=el('input','');search.type='search';search.placeholder='Find a manufacturer or model';search.setAttribute('aria-label','Search map device coverage');
const status=el('p','Loading map models…'),cards=el('div','');cards.className='reference-grid';const controls=el('div','');controls.className='reference-controls';const searchLabel=el('label','Search mapped devices');searchLabel.append(search);controls.append(searchLabel);coverage.append(controls,status,cards);$('cloud-list').before(coverage);
loadMapInventory().then(data=>{
 let limit=12;const vendors=vendorInventory(data.models);search.value=new URLSearchParams(location.search).get('vendor')||'';
 function show(){const q=search.value.toLowerCase(),rows=vendors.filter(([v,models])=>[v,...models.map(m=>m.name)].join(' ').toLowerCase().includes(q));cards.replaceChildren();status.textContent=`${rows.length} manufacturers / unknown groups · ${data.models.length} map model groups`;
  for(const [vendor,models] of rows.slice(0,limit)){const card=el('article','');card.className='reference-card';card.append(el('h2',vendor),el('p',`${models.length} model groups · ${models.reduce((n,m)=>n+m.records,0).toLocaleString()} map records`));
   const services=servicesForVendor(vendor);card.append(el('p',services.length?'Documented vendor services: '+services.map(s=>s.name).join(', ')+'. Model-specific participation requires separate evidence.':'Cloud service and model-specific communications not yet verified.'));
   const details=el('details','');details.append(el('summary','Models in the map'));for(const row of models){const p=el('p',row.name+' · '+row.category+' · ');const a=el('a','Device details ↗');a.href=deviceLinks(row).library;p.append(a);details.append(p);}card.append(details);
   const a=el('a','Explore vendor galaxy ↗');a.href=deviceLinks(models[0]).galaxy;card.append(a);cards.append(card);
  }
  if(rows.length>limit){const more=el('button','Show more manufacturers');more.onclick=()=>{limit+=12;show();};cards.append(more);}
 }
 search.oninput=()=>{limit=12;show();};show();
}).catch(()=>status.textContent='Map coverage is temporarily unavailable. Documented services remain below.');
