import {mapVendors} from './map-vendor-data.mjs';
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

let vendorLimit=24;
function vendorServices(v){const key=v.name.toLowerCase();const aliases={'anduril industries':'Anduril','unitree robotics':'Unitree','general atomics aeronautical systems':'General Atomics','wing aviation llc':'Wing'};return cloudSurfaces.services.filter(s=>s.vendor.toLowerCase()===key||s.vendor===aliases[key]);}
function renderVendors(){const q=$('vendor-search').value.toLowerCase().trim(),rows=mapVendors.vendors.filter(v=>[v.name,...v.models.map(m=>m.name)].join(' ').toLowerCase().includes(q));$('vendor-count').textContent=`${rows.length} of ${mapVendors.vendors.length} manufacturer names · map inventory ${mapVendors.reviewed_on}`;$('vendor-list').replaceChildren();for(const v of rows.slice(0,vendorLimit)){const details=el('details',''),summary=el('summary',v.name+' · '+v.records+' map records');details.append(summary);const matches=vendorServices(v);details.append(el('p',matches.length?'Documented references: '+matches.map(s=>s.name).join(' · '):'Cloud service research: not yet reviewed. No public interface is asserted.'));if(v.url){const a=el('a','Manufacturer website ↗');a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}for(const m of v.models){const p=el('p',m.name+' · '+m.kind);if(m.url){const a=el('a',' Model reference ↗');a.href=m.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}details.append(p);}$('vendor-list').append(details);}$('vendor-more').hidden=rows.length<=vendorLimit;}
$('vendor-search').addEventListener('input',()=>{vendorLimit=24;renderVendors();});$('vendor-more').onclick=()=>{vendorLimit+=24;renderVendors();};renderVendors();
