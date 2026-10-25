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
