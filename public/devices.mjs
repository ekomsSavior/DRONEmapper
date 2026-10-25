import {libraryModels} from './device-library-model.mjs';
import {deviceReferences} from './security-device-references.mjs';
const $=id=>document.getElementById(id);
const models=libraryModels();
const make=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
function link(label,url){const a=make('a',label);if(/^https:\/\//.test(url))a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
for(const category of [...new Set(models.map(m=>m.category))].sort())$('reference-category').append(new Option(category,category));
for(const vendor of [...new Set(models.map(m=>m.maker))].sort())$('reference-vendor').append(new Option(vendor,vendor));
const selectedVendor=new URLSearchParams(location.search).get('vendor');if(selectedVendor)$('reference-vendor').value=selectedVendor;
function render(){
 const q=$('reference-search').value.trim().toLowerCase(),category=$('reference-category').value;
 const vendor=$('reference-vendor').value;
 const matches=models.filter(m=>(!vendor||m.maker===vendor)&&(!category||m.category===category)&&(!q||[m.maker,m.name,m.category,m.connection,m.description,m.reception,...m.aliases].join(' ').toLowerCase().includes(q)));
 $('reference-count').textContent=`${matches.length} of ${models.length} product and program references · reviewed ${deviceReferences.reviewed_on}`;
 const list=$('reference-list');list.replaceChildren();
 for(const m of matches){
  const card=make('article','','reference-card');
  card.append(make('p',m.maker+' · '+m.category,'eyebrow'),make('h2',m.name),make('p',m.description));
  const comms=make('p');comms.append(make('strong','Published communications: '),document.createTextNode(m.connection));card.append(comms,make('p',m.reception,'reference-reception'));
  const links=make('p');links.append(link('Product / program ↗',m.url),document.createTextNode(' · '),link('Manufacturer ↗',m.manufacturer_url));card.append(links);
  const evidence=make('details');evidence.append(make('summary','Reference details'),link('Published source ↗',m.source));
  for(const related of m.related_links||[])evidence.append(document.createTextNode(' · '),link(related.name+' ↗',related.url));
  card.append(evidence);list.append(card);
 }
 if(!matches.length)list.append(make('p','No matching reference. Try a product family or another category.'));
}
$('reference-vendor').addEventListener('change',render);
$('reference-search').addEventListener('input',render);$('reference-category').addEventListener('change',render);render();
