import {deviceReferences} from './security-device-references.mjs';
const $=id=>document.getElementById(id);
const models=deviceReferences.models.filter(m=>m.group==='anduril').sort((a,b)=>Number(b.vendor==='warhound')-Number(a.vendor==='warhound')||a.name.localeCompare(b.name));
const make=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
function link(label,url){const a=make('a',label);if(/^https:\/\//.test(url))a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
for(const category of [...new Set(models.map(m=>m.category))].sort())$('reference-category').append(new Option(category,category));
function render(){
 const q=$('reference-search').value.trim().toLowerCase(),category=$('reference-category').value;
 const matches=models.filter(m=>(!category||m.category===category)&&(!q||[m.name,m.category,m.connection,m.description,m.reception,...m.aliases].join(' ').toLowerCase().includes(q)));
 $('reference-count').textContent=`${matches.length} of ${models.length} product and program references · reviewed ${deviceReferences.reviewed_on}`;
 const list=$('reference-list');list.replaceChildren();
 for(const m of matches){
  const card=make('article','','reference-card');
  card.append(make('p',m.category.toUpperCase(),'eyebrow'),make('h2',m.name),make('p',m.description));
  const comms=make('p');comms.append(make('strong','Published communications: '),document.createTextNode(m.connection));card.append(comms,make('p',m.reception,'reference-reception'));
  const links=make('p');links.append(link('Product / program ↗',m.url),document.createTextNode(' · '),link('Manufacturer ↗',m.manufacturer_url));card.append(links);
  const evidence=make('details');evidence.append(make('summary','Reference details'),link('Published source ↗',m.source));
  for(const related of m.related_links||[])evidence.append(document.createTextNode(' · '),link(related.name+' ↗',related.url));
  card.append(evidence);list.append(card);
 }
 if(!matches.length)list.append(make('p','No matching reference. Try a product family or another category.'));
}
$('reference-search').addEventListener('input',render);$('reference-category').addEventListener('change',render);render();
