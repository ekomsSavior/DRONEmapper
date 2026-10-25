import {cloudSurfaces} from './cloud-surface-data.mjs';
import {buildGalaxy} from './galaxy-model.mjs';
const {nodes,edges}=buildGalaxy(),byId=new Map(nodes.map(n=>[n.id,n]));
const $=id=>document.getElementById(id),svg=$('universe'),space=$('space'),NS='http://www.w3.org/2000/svg';
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
const se=(tag,attrs)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
const link=(name,url)=>{const a=el('a',name);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
const home=[-50,-220,2300,Math.max(...nodes.map(n=>n.y))+500];
let selected=null,view=[...home],drag=null,moved=false;
function applyView(){svg.setAttribute('viewBox',view.join(' '));}
function zoom(f,cx=view[0]+view[2]/2,cy=view[1]+view[3]/2){const w=Math.min(4400,Math.max(240,view[2]*f)),h=w*view[3]/view[2],ratio=w/view[2];view=[cx-(cx-view[0])*ratio,cy-(cy-view[1])*ratio,w,h];applyView();}
$('zoom-in').onclick=()=>zoom(.75);$('zoom-out').onclick=()=>zoom(1.33);$('reset').onclick=()=>{view=[...home];applyView();};
function point(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());}
svg.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);zoom(e.deltaY>0?1.12:.89,p.x,p.y);},{passive:false});
svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,view:[...view],matrix:svg.getScreenCTM().inverse()};moved=false;});
svg.addEventListener('pointermove',e=>{if(!drag)return;const a=new DOMPoint(drag.x,drag.y).matrixTransform(drag.matrix),b=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix);if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)moved=true;if(moved){view=[drag.view[0]+a.x-b.x,drag.view[1]+a.y-b.y,...drag.view.slice(2)];applyView();}});
window.addEventListener('pointerup',()=>{drag=null;});svg.addEventListener('pointercancel',()=>{drag=null;});
const defs=svg.querySelector('defs');
for(const [i,kind] of ['dots','hatch','grid'].entries()){const p=se('pattern',{id:kind,width:14,height:14,patternUnits:'userSpaceOnUse'});p.append(kind==='dots'?se('circle',{cx:3,cy:3,r:1,fill:'#555'}):se('path',{d:kind==='hatch'?'M0 14L14 0':'M0 0H14V14',stroke:'#444','stroke-width':1}));defs.append(p);}
// Stable decorative stars are not observation markers.
for(let i=0;i<240;i++)space.append(se('circle',{cx:(i*719)%2200,cy:(i*397)%1750,r:i%3===0?1.2:.6,fill:'#777',opacity:.35}));
for(const [i,s] of cloudSurfaces.services.entries()){const n=byId.get(s.id);space.append(se('ellipse',{cx:n.x,cy:n.y,rx:205,ry:185,fill:`url(#${['dots','hatch','grid'][i%3]})`,opacity:.32,stroke:'#555','stroke-dasharray':i%2?'3 8':'1 0'}));}
const edgeEls=new Map(),nodeEls=new Map();
function activate(e,fn){if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.type==='keydown')e.preventDefault();if(!moved||e.type==='keydown')fn();}
for(const [i,e] of edges.entries()){const a=byId.get(e.from),b=byId.get(e.to),line=se('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'edge',tabindex:0,role:'button','aria-label':a.name+' to '+b.name+': '+e.label,'stroke-dasharray':e.label.includes('association')?'5 6':'none'});line.addEventListener('click',ev=>activate(ev,()=>inspectEdge(e)));line.addEventListener('keydown',ev=>activate(ev,()=>inspectEdge(e)));space.append(line);edgeEls.set(e,line);}
for(const n of nodes){const g=se('g',{class:'node '+n.type,transform:`translate(${n.x} ${n.y})`,tabindex:0,role:'button','aria-label':n.name+' — '+n.type});g.append(se('circle',{r:n.type==='service'?27:15,class:'halo'}));g.append(n.type==='vendor'?se('rect',{x:-9,y:-9,width:18,height:18,class:'core'}):se('circle',{r:n.type==='service'?13:7,class:'core'}));const text=se('text',{x:0,y:33,'text-anchor':'middle'});text.textContent=n.name;g.append(text);g.addEventListener('click',ev=>activate(ev,()=>inspectNode(n)));g.addEventListener('keydown',ev=>activate(ev,()=>inspectNode(n)));space.append(g);nodeEls.set(n.id,g);}
function detail(s){const panel=$('inspector');for(const [k,v] of [['Data',s.data],['Protocols',s.protocols.join(' · ')],['Access',s.access],['Useful to contributors',s.useful],['Limits',s.gap]])panel.append(el('h3',k),el('p',v));panel.append(link('Official evidence ↗',s.source),el('p','Reviewed '+s.reviewed_on+' · '+s.connector));}
function inspectNode(n){selected=n.id;const p=$('inspector');p.replaceChildren(el('p',n.type.toUpperCase()),el('h2',n.name));if(n.type!=='vendor')detail(n.service);p.append(el('h3','Connections'));for(const e of edges.filter(e=>e.from===n.id||e.to===n.id)){const other=byId.get(e.from===n.id?e.to:e.from),b=el('button',e.label+' → '+other.name);b.onclick=()=>inspectEdge(e);p.append(b);}filter();}
function inspectEdge(e){selected=null;const p=$('inspector');p.replaceChildren(el('h2',e.label),el('p',byId.get(e.from).name+' → '+byId.get(e.to).name),link('Evidence for this connection ↗',e.source));for(const id of [e.from,e.to]){const b=el('button','Explore '+byId.get(id).name);b.onclick=()=>inspectNode(byId.get(id));p.append(b);}p.append(el('p',e.service.gap));filter();edgeEls.get(e).classList.add('selected');}
for(const c of [...new Set(cloudSurfaces.services.map(s=>s.category))].sort())$('category').append(new Option(c,c));
function filter(){const q=$('search').value.toLowerCase().trim(),c=$('category').value,services=cloudSurfaces.services.filter(s=>(!c||s.category===c)&&(!q||JSON.stringify(s).toLowerCase().includes(q))),ids=new Set(services.map(s=>s.id)),visible=new Set(nodes.filter(n=>n.type==='vendor'?services.some(s=>s.vendor===n.name):ids.has(n.service.id)).map(n=>n.id));for(const n of nodes){const g=nodeEls.get(n.id);g.classList.toggle('dim',!visible.has(n.id));g.classList.toggle('selected',n.id===selected);g.setAttribute('tabindex',visible.has(n.id)?0:-1);}for(const [e,g]of edgeEls){g.classList.toggle('dim',!(visible.has(e.from)&&visible.has(e.to)));g.classList.remove('selected');g.setAttribute('tabindex',visible.has(e.from)&&visible.has(e.to)?0:-1);}$('counts').textContent=`${services.length} / ${cloudSurfaces.services.length} service galaxies · ${nodes.length} nodes · ${edges.length} documented connections`;$('results').replaceChildren();for(const s of services){const b=el('button',s.name);b.onclick=()=>{const n=byId.get(s.id);view=[n.x-390,n.y-310,780,620];applyView();inspectNode(n);};$('results').append(b);}if(!services.length)$('results').append(el('p','No matches. Try another vendor or protocol.'));}
$('search').addEventListener('input',filter);$('category').addEventListener('change',filter);filter();

applyView();

// Expand one vendor's device constellation on demand, preserving every researched edge.
import {loadMapInventory,vendorInventory,servicesForVendor,deviceLinks} from './map-device-coverage.mjs';
const inventoryPanel=el('section','');inventoryPanel.append(el('h2','All map devices'));
const inventorySearch=el('input','');inventorySearch.type='search';inventorySearch.placeholder='Search mapped models';inventorySearch.setAttribute('aria-label','Search mapped models');
const vendorSelect=el('select','');vendorSelect.setAttribute('aria-label','Map device manufacturer');const inventoryNote=el('p','Loading map inventory…');inventoryPanel.append(inventorySearch,vendorSelect,inventoryNote);$('results').after(inventoryPanel);
const deviceLayer=se('g',{'aria-label':'Selected vendor device constellation',class:'device-constellation'});space.append(deviceLayer);
loadMapInventory().then(data=>{
 const vendors=vendorInventory(data.models);
 function options(){const current=vendorSelect.value,q=inventorySearch.value.toLowerCase();vendorSelect.replaceChildren(new Option('Choose a map manufacturer',''));for(const [v,rows] of vendors)if([v,...rows.map(r=>r.name)].join(' ').toLowerCase().includes(q))vendorSelect.append(new Option(v,v));vendorSelect.value=current;}
 function expand(){deviceLayer.replaceChildren();const rows=vendors.find(([v])=>v===vendorSelect.value)?.[1];if(!rows)return;const vendor=vendorSelect.value,existing=nodes.find(n=>n.type==='vendor'&&n.name.toLowerCase()===vendor.toLowerCase());const cx=existing?.x??2700,cy=existing?.y??350;
  const radius=Math.max(260,rows.length*25),center=se('g',{class:'node vendor',transform:`translate(${cx} ${cy})`});center.append(se('rect',{x:-9,y:-9,width:18,height:18,class:'core'}));const title=se('text',{x:0,y:-25,'text-anchor':'middle'});title.textContent=vendor;center.append(title);deviceLayer.append(center);
  rows.forEach((row,i)=>{const angle=2*Math.PI*i/rows.length,x=cx+radius*Math.cos(angle),y=cy+radius*Math.sin(angle);if(vendor!=='Unknown manufacturer')deviceLayer.append(se('line',{x1:cx,y1:cy,x2:x,y2:y,class:'edge','stroke-dasharray':'3 6'}));
   const g=se('g',{class:'node device',transform:`translate(${x} ${y})`,tabindex:0,role:'button','aria-label':row.name+' — map device'});g.append(se('circle',{r:8,class:'core'}));const label=se('text',{x:0,y:25,'text-anchor':'middle'});label.textContent=row.name;g.append(label);
   const inspect=()=>{const p=$('inspector'),links=deviceLinks(row);p.replaceChildren(el('h2',row.name),el('p',row.maker+' · '+row.category),el('p',row.records+' map records'),el('p','Dotted line: manufacturer reported by map records. It does not establish a cloud or network connection.'));for(const [name,url] of [['Device library',links.library],['Cloud research',links.cloud],['Product',links.product],['Manufacturer',links.manufacturer]])if(url)p.append(link(name+' ↗',url));};g.onclick=()=>{if(!moved)inspect();};g.onkeydown=e=>activate(e,inspect);deviceLayer.append(g);
  });
  inventoryNote.textContent=rows.length+' mapped model groups · '+(servicesForVendor(vendor).length?'documented services remain connected in the original graph':'cloud relationships not yet verified');view=[cx-radius-180,cy-radius-100,(radius+180)*2,(radius+100)*2];applyView();
 }
 inventorySearch.oninput=options;vendorSelect.onchange=expand;options();inventoryNote.textContent=data.models.length+' model groups from the map. Choose a vendor to expand its devices.';const initial=new URLSearchParams(location.search).get('vendor');if(initial){vendorSelect.value=initial;expand();}
}).catch(()=>inventoryNote.textContent='Map inventory is temporarily unavailable. The documented network remains available.');
