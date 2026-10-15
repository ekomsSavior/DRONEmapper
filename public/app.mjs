import {companyWebsite} from './company-links.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {drone:'Drone','robot-dog':'Robot dog',humanoid:'Humanoid','ground-robot':'Ground robot','delivery-robot':'Delivery robot','industrial-robot':'Industrial robot','autonomous-vehicle':'Autonomous vehicle','surface-vessel':'Unmanned vessel',underwater:'Underwater vehicle',unknown:'Unknown',delivery:'Delivery','public-safety':'Public safety',research:'Research',commercial:'Commercial',personal:'Personal',defense:'Defense'};
const state={data:null,kind:'all',layer:'all',hours:24,search:'',purpose:'all',selected:null,offset:0,pending:false,error:false,limit:100,version:0};
const now=()=>Date.now()/1000+state.offset;
const age=t=>{if(!Number.isFinite(t))return 'Unknown';const s=Math.max(0,now()-t);return s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`;};
const date=t=>t?new Date(t*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not reported';
const isPosition=t=>t.record_type==='position';
const isLive=t=>isPosition(t)&&now()-t.observed_at<=120&&now()>=t.observed_at;
const label=t=>isPosition(t)?`${isLive(t)?'Live position':'Last position'} · ${age(t.observed_at)}`:t.record_type==='historical'?`Historical · ${t.archive_year} archive`:t.status==='pilot'?'Documented pilot':t.status==='documented-program'?'Documented drone program':'Documented deployment';
const glyph=t=>t.domain==='air'?'△':t.kind==='robot-dog'?'◇':t.domain==='water'?'≈':'□';
const map=L.map('map',{zoomControl:false,worldCopyJump:true,minZoom:2,maxZoom:18}).setView([22,10],2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
map.attributionControl.setPrefix(false);
L.control.scale({imperial:false}).addTo(map);
const markers=L.layerGroup().addTo(map),trails=L.layerGroup().addTo(map);
let toastTimer,renderKey='';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function allRecords(){return state.data?[...state.data.tracks,...state.data.activity]:[];}
function matching(){const b=map.getBounds();return allRecords().filter(t=>
  (!isPosition(t)||now()-t.observed_at<=state.hours*3600)&&
  (state.layer==='all'||state.layer==='positions'&&isPosition(t)||state.layer==='activity'&&t.record_type==='activity'||state.layer==='historical'&&t.record_type==='historical')&&
  (state.kind==='all'||t.domain===state.kind||t.kind===state.kind)&&
  (state.purpose==='all'||t.purpose===state.purpose)&&
  (!$('in-view').checked||[-360,0,360].some(o=>b.contains([t.latitude,t.longitude+o])))&&
  (!state.search||[t.name,t.model,t.manufacturer,t.operator,t.place,t.registration,t.callsign].filter(Boolean).join(' ').toLowerCase().includes(state.search))
).sort((a,b)=>Number(isPosition(b))-Number(isPosition(a))||(b.observed_at||0)-(a.observed_at||0)||a.name.localeCompare(b.name));}
function resetFilters(){state.kind='all';state.layer='all';state.search='';state.purpose='all';state.limit=100;$('search').value='';$('purpose').value='all';$('in-view').checked=false;document.querySelectorAll('[data-kind],[data-layer]').forEach(b=>b.setAttribute('aria-pressed',(b.dataset.kind||b.dataset.layer)==='all'));render(true);}
function render(force=false){
 if(!state.data)return;
 const records=matching(),collection=state.data.collection;
 $('active-count').textContent=records.filter(isLive).length.toLocaleString();
 $('drone-count').textContent=records.filter(t=>t.domain==='air').length.toLocaleString();
 $('robot-count').textContent=records.filter(t=>t.domain!=='air').length.toLocaleString();
 $('result-count').textContent=records.length.toLocaleString();
 $('result-caption').textContent=state.layer==='positions'?'MEASURED POSITIONS':state.layer==='activity'?'DEPLOYMENT RECORDS':state.layer==='historical'?'HISTORICAL RECORDS':'ACTIVITY RECORDS';
 $('connection').textContent=state.error?'RECONNECTING':collection.collecting?'UPDATING':collection.delayed?'PARTIAL UPDATE':'AUTO · 5 MIN';
 $('server-status').textContent=state.error?'CONNECTION LOST':collection.delayed?'SOME UPDATES DELAYED':'AUTOMATIC COLLECTION ACTIVE';
 $('collection-summary').textContent=`${allRecords().length.toLocaleString()} records worldwide`;
 $('last-check').textContent=collection.last_success?`UPDATED ${age(collection.last_success).toUpperCase()}`:'COLLECTING DATA';
 $('map-status').hidden=records.length>0;
 $('map-status-title').textContent=state.layer==='positions'?'No positions match this view':'No matching activity';
 $('map-status-body').textContent=state.layer==='positions'?'Try a wider time window or switch to All activity. Deployment areas remain available.':'Try another area or reset your filters.';
 const key=[state.version,state.kind,state.layer,state.hours,state.search,state.purpose,state.limit,$('in-view').checked?map.getBounds().toBBoxString():'',Math.floor(now()/120)].join('|');
 if(force||key!==renderKey){
  renderKey=key;
  $('observations').innerHTML=records.length?records.slice(0,state.limit).map(t=>`<button class="track-row${state.selected===t.id?' selected':''}" data-record="${esc(t.id)}"><span class="track-icon" aria-hidden="true">${glyph(t)}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.place||names[t.kind]||t.kind)}</small><span class="row-meta"><span class="record-badge${isLive(t)?' live':''}">${esc(label(t))}</span></span></span></button>`).join('')+(records.length>state.limit?`<button class="load-more" id="load-more">Show more · ${records.length-state.limit} remaining</button>`:''):'<div class="empty"><div class="empty-symbol">⌁</div><h1>No matching records</h1><p>Change a filter or choose All activity to explore documented deployments.</p><button id="empty-reset">Reset filters</button></div>';
  document.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>selectRecord(b.dataset.record));
  if($('load-more'))$('load-more').onclick=()=>{state.limit+=100;render(true);};
  if($('empty-reset'))$('empty-reset').onclick=resetFilters;
 }
 drawMarkers(records);
 if(state.selected){const t=allRecords().find(r=>r.id===state.selected);if(t&&records.some(r=>r.id===t.id))showDetail(t);else closeDetail();}
}
function drawMarkers(records){
 markers.clearLayers();
 const bins=new Map(),center=map.getCenter().lng;
 for(const t of records){const lng=t.longitude+360*Math.round((center-t.longitude)/360);const p=map.project([t.latitude,lng],map.getZoom());const key=`${Math.floor(p.x/44)}:${Math.floor(p.y/44)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({...t,displayLng:lng});}
 for(const group of bins.values()){
  if(group.length>1){const lat=group.reduce((s,t)=>s+t.latitude,0)/group.length,lng=group.reduce((s,t)=>s+t.displayLng,0)/group.length;
   const marker=L.marker([lat,lng],{icon:L.divIcon({className:'cluster-wrap',html:`<span class="cluster">${group.length}</span>`,iconSize:[36,36],iconAnchor:[18,18]}),title:`${group.length} activity records`});
   marker.on('click',()=>{if(map.getZoom()<13&&new Set(group.map(t=>`${t.latitude},${t.longitude}`)).size>1)map.setView([lat,lng],Math.min(map.getZoom()+3,14));else showGroup(group);}).addTo(markers);
  }else{
   const t=group[0],type=t.kind==='robot-dog'?'robot-dog':t.domain==='air'?'drone':t.domain==='water'?'water':'robot';
   const marker=L.marker([t.latitude,t.displayLng],{icon:L.divIcon({className:'marker-wrap',html:`<span class="map-marker ${type} ${isPosition(t)?isLive(t)?'position':'older':t.record_type==='historical'?'historical':'deployment'}"></span>`,iconSize:[28,28],iconAnchor:[14,14]}),title:`${t.name} · ${label(t)}`});
   const tip=document.createElement('span');tip.textContent=`${t.name} · ${label(t)}`;marker.bindTooltip(tip).on('click',()=>selectRecord(t.id,false)).addTo(markers);
  }
 }
}
function showGroup(group){$('detail').hidden=false;state.selected=null;trails.clearLayers();$('detail').innerHTML=`<button class="detail-close" id="close-detail" aria-label="Close details">×</button><span class="eyebrow">ACTIVITY IN THIS AREA</span><h2>${group.length} records</h2><p>Deployment markers identify areas. They do not show the current position of individual vehicles.</p>${group.map(t=>`<button class="group-record" data-group="${esc(t.id)}"><strong>${esc(t.name)}</strong><small>${esc(label(t))}</small></button>`).join('')}`;$('close-detail').onclick=closeDetail;document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>selectRecord(b.dataset.group,false));}
function selectRecord(id,move=true){const t=allRecords().find(x=>x.id===id);if(!t)return;state.selected=id;if(move)map.setView([t.latitude,t.longitude],isPosition(t)?9:8);showDetail(t);render(true);if(innerWidth<=700)document.querySelector('.map-workspace').scrollIntoView({behavior:'smooth',block:'start'});}
function showDetail(t){
 $('detail').hidden=false;
 const fields=[['Type',names[t.kind]||t.kind],['Record',isPosition(t)?(t.position_basis==='reported'?'Reported position':'Measured position'):t.record_type==='historical'?'Historical area':'Deployment area'],['Model',t.model||'Unknown'],['Manufacturer',t.manufacturer||'Unknown',companyWebsite(t.manufacturer)],['Operator',t.operator||'Unknown',companyWebsite(t.operator)],['Purpose',names[t.purpose]||t.purpose||'Unknown'],['Location precision',t.precision||'Not reported']];
 if(isPosition(t)){fields.push(['Observed',date(t.observed_at)],['Position',`${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`]);if(Number.isFinite(t.altitude_m))fields.push(['Altitude',`${Math.round(t.altitude_m)} m · ${t.altitude_reference||'reference unknown'}`]);if(Number.isFinite(t.speed_mps))fields.push(['Speed',`${t.speed_mps.toFixed(1)} m/s`]);if(t.registration)fields.push(['Registration',t.registration]);}
 else if(t.record_type==='historical'){fields.push(['Area',t.place||'Not reported'],['Record dates',t.record_dates||'Not specified'],['Archive edition',t.archive_year],['Record status',t.status==='historical-base'?'Historical base record':'Historical authorization']);}
 else{fields.push(['Area',t.place||'Not reported'],[t.status==='documented-program'?'Documentation dates':'First recorded',t.record_dates||t.first_year||'Not reported'],['Activity status',t.status==='pilot'?'Pilot / trial':t.status==='documented-program'?'Documented program; current use unverified':'Reported deployment']);}
 $('detail').innerHTML=`<button class="detail-close" id="close-detail" aria-label="Close details">×</button><span class="eyebrow">${esc(label(t).toUpperCase())}</span><h2>${esc(t.name)}</h2><p>${esc(names[t.kind]||t.kind)}</p><dl>${fields.map(([k,v,url])=>`<div><dt>${esc(k)}</dt><dd>${url?`<a class="company-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(v)} website (opens in a new tab)">${esc(v)} <span aria-hidden="true">↗</span></a>`:esc(v)}</dd></div>`).join('')}</dl><p class="detail-evidence">${isPosition(t)?(t.position_basis==='reported'?'This is a provider-reported location at the displayed time. Its positioning method is unspecified. The marker is not moved forward between reports.':'This is a measured position at the displayed time. The marker is not moved forward between reports.'):t.record_type==='historical'?'This is an older authorization or base record. It does not establish that a drone is present, that a flight occurred, or that an authorization remains valid.':'This is a published deployment record at an approximate area. It is not a live sighting or a count of vehicles currently present.'}</p>`;
 $('close-detail').onclick=closeDetail;trails.clearLayers();
 if(isPosition(t)&&t.trail?.length>1){let segment=[];for(const p of t.trail){const prior=segment.at(-1);if(prior&&(p.observed_at-prior.observed_at>600||Math.abs(p.longitude-prior.longitude)>180)){drawSegment(segment);segment=[];}segment.push(p);}drawSegment(segment);}
}
function drawSegment(points){if(points.length>1)L.polyline(points.map(p=>[p.latitude,p.longitude]),{color:'#eee',weight:2,opacity:.7,dashArray:'4 5'}).addTo(trails);}
function closeDetail(){state.selected=null;$('detail').hidden=true;trails.clearLayers();}
async function refresh(){if(state.pending)return;state.pending=true;const hours=state.hours;try{const response=await fetch(`feed?hours=${hours}`,{cache:'no-store'});if(!response.ok)throw Error('unavailable');const data=await response.json();if(data.schema_version!==2||!Array.isArray(data.tracks)||!Array.isArray(data.activity))throw Error('invalid feed');state.offset=data.server_time-Date.now()/1000;state.data=data;state.version++;state.error=false;render();}catch{state.error=true;if(state.data)render();else{$('connection').textContent='UNAVAILABLE';$('map-status-title').textContent='Activity connection unavailable';$('map-status-body').textContent='Reconnecting automatically. No activity has been loaded.';}}finally{state.pending=false;if(state.hours!==hours)refresh();}}
map.on('moveend',()=>{const c=map.getCenter();$('map-coordinate').textContent=`${c.lat.toFixed(2)}°, ${L.Util.wrapNum(c.lng,[-180,180]).toFixed(2)}° / Z${map.getZoom()}`;render();});map.fire('moveend');
$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('reset-view').onclick=()=>map.setView([22,10],2);$('reset-filters').onclick=resetFilters;$('refresh-view').onclick=()=>refresh();
$('locate').onclick=()=>{if(!navigator.geolocation)return toast('Location unavailable. Pan or search the map.');navigator.geolocation.getCurrentPosition(p=>map.setView([p.coords.latitude,p.coords.longitude],10),()=>toast('Location unavailable. Pan or search the map.'),{timeout:10000,maximumAge:60000});};
document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{state.kind=b.dataset.kind;state.limit=100;document.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',x===b));render(true);});
document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{state.layer=b.dataset.layer;state.limit=100;document.querySelectorAll('[data-layer]').forEach(x=>x.setAttribute('aria-pressed',x===b));render(true);});
document.querySelectorAll('[data-hours]').forEach(b=>b.onclick=()=>{state.hours=Number(b.dataset.hours);document.querySelectorAll('[data-hours]').forEach(x=>x.setAttribute('aria-pressed',x===b));closeDetail();render(true);refresh();});
$('search').oninput=e=>{state.search=e.target.value.trim().toLowerCase();state.limit=100;render(true);};$('purpose').onchange=e=>{state.purpose=e.target.value;state.limit=100;render(true);};$('in-view').onchange=()=>render(true);
function about(){const c=state.data?.collection;$('dialog-kicker').textContent='DRONE MAPPER / SAVIORSEC';$('dialog-content').innerHTML=`<h1 id="dialog-title">The autonomous world, mapped.</h1><p class="intro">Drones, robots and autonomous vehicles across air, ground and water. Free to explore in your browser.</p><div class="process"><div><span>01 / POSITIONS</span><strong>Where it was observed</strong><p>Published positions retain their observation timestamps. Live means a report within two minutes.</p></div><div><span>02 / ACTIVITY</span><strong>Where it has been deployed</strong><p>Documented deployment areas and pilots, plus a separate dated History layer. These records never become moving vehicles.</p></div><div><span>03 / UPDATES</span><strong>Every five minutes</strong><p>Collection runs automatically on the server. Your map refreshes as new records arrive.</p></div></div><p>Last collection: ${c?.last_success?esc(date(c.last_success)):'In progress'}. Coverage varies by region and vehicle. Missing records do not mean an area is clear. Autonomous vehicle records may include supervised pilots; operation without a human is not assumed.</p><p>Research measurements, fleet deployments and aircraft positions have different update speeds. Model and operator information is shown only when available.</p><div class="dialog-links"><a href="source.zip">Download open-source code ↗</a><a href="credits.html">Credits & licenses ↗</a></div>`;$('info-dialog').showModal();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>b.dataset.view==='about'?about():$('info-dialog').close());$('close-dialog').onclick=()=>$('info-dialog').close();
document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)&&!$('info-dialog').open){e.preventDefault();$('search').focus();}if(e.key==='Escape')closeDetail();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},15000);setInterval(()=>{if(!document.hidden&&state.data)render();},30000);refresh();
