import {datasetFor,parseCsv,jsonCollections,recordLabel,pageRecords} from './research-data-model.mjs';
const $=id=>document.getElementById(id);
let rows=[],headers=[],sections=[],page=0,format='json',controller,loading=true,searchTimer;
const number=n=>n.toLocaleString();
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function render(){
 if(loading)return;
 const size=100;
 const result=pageRecords(rows,$('data-search').value,page,size);page=result.page;
 $('data-status').textContent=result.total?`${number(result.start+1)}–${number(result.start+result.rows.length)} of ${number(result.total)} records${$('data-search').value.trim()?' matching your search':''}.`:'No records match your search.';
 $('previous-page').disabled=page===0;$('next-page').disabled=page+1>=result.pages;
 $('page-label').textContent=`Page ${number(page+1)} of ${number(result.pages)}`;
 const content=document.createDocumentFragment();
 if(format==='csv'&&result.total){
  const scroll=node('div',undefined,'data-table-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','CSV records; scroll horizontally for all columns');
  const table=node('table',undefined,'data-table');table.append(node('caption',`${$('dataset').selectedOptions[0].textContent} · ${headers.length} columns`));
  const thead=node('thead'),tr=node('tr');for(const name of headers){const th=node('th',name);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);
  const tbody=node('tbody');for(const row of result.rows){const tr=node('tr');for(const value of row){const td=node('td');if(/^https:\/\/[^\s]+$/.test(value)){const a=node('a',value);a.href=value;a.target='_blank';a.rel='noopener noreferrer';td.append(a);}else td.textContent=value;tr.append(td);}tbody.append(tr);}table.append(tbody);scroll.append(table);content.append(scroll);
 }else if(format==='json'){
  result.rows.forEach((row,i)=>{const details=node('details',undefined,'data-record');details.open=i===0;details.append(node('summary',recordLabel(row,result.start+i)),node('pre',JSON.stringify(row,null,2)));content.append(details);});
 }
 $('data-results').replaceChildren(content);$('data-results').setAttribute('aria-busy','false');
}
function updateCollection(){const selection=sections.find(s=>s.id===$('collection').value);rows=selection?.rows||[];page=0;render();}
async function load(name){
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 clearTimeout(searchTimer);loading=true;rows=[];page=0;
 const dataset=datasetFor(name);
 $('data-results').replaceChildren();$('data-results').setAttribute('aria-busy','true');$('data-search').value='';$('data-search').disabled=true;
 $('previous-page').disabled=$('next-page').disabled=true;$('page-label').textContent='';$('section-control').hidden=true;$('download-data').hidden=true;
 if(!dataset){$('data-status').textContent='Dataset not found. Choose one from the list.';$('data-results').setAttribute('aria-busy','false');return;}
 $('dataset').value=name;format=dataset.format;
 document.title=`${dataset.title} — DRONEmapper`;$('dataset-title').textContent=dataset.title;$('dataset-description').textContent=dataset.description;
 const download=$('download-data');download.href='/downloads/data/'+name;download.download=name;download.textContent=`Download ${format.toUpperCase()}`;download.hidden=false;
 $('data-status').textContent='Loading preview…';
 try{
  const response=await fetch(download.href,{signal,credentials:'omit'});if(!response.ok)throw Error(`Could not load the dataset (HTTP ${response.status}).`);
  const text=await response.text();if(signal.aborted)return;
  if(format==='csv'){({headers,rows}=parseCsv(text));}
  else{sections=jsonCollections(JSON.parse(text));$('collection').replaceChildren(...sections.map(section=>{const option=node('option',`${section.id} (${number(section.rows.length)})`);option.value=section.id;return option;}));$('collection').value=sections.some(s=>s.id==='devices')?'devices':sections[0]?.id;rows=sections.find(s=>s.id===$('collection').value)?.rows||[];$('section-control').hidden=false;}
  loading=false;$('data-search').disabled=false;render();
 }catch(error){if(signal.aborted)return;$('data-status').textContent=`${error.message} Reload the page to try again.`;$('data-results').setAttribute('aria-busy','false');}
}
$('dataset').addEventListener('change',()=>{const url=new URL(location.href);url.searchParams.set('file',$('dataset').value);history.pushState(null,'',url);load($('dataset').value);});
$('collection').addEventListener('change',()=>{clearTimeout(searchTimer);$('data-search').value='';updateCollection();});
$('data-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=0;render();},150);});
$('previous-page').addEventListener('click',()=>{page--;render();});$('next-page').addEventListener('click',()=>{page++;render();});
const loadLocation=()=>load(new URL(location.href).searchParams.get('file')||'devices-global.json');
window.addEventListener('popstate',loadLocation);loadLocation();
