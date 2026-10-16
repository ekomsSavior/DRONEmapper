// DRONE MAPPER production adapters. AGPL-3.0-or-later.
import {DEPLOY_URL,ADSB_URL,UAV_TYPES,KINDS,EXCLUDE_MODELS,GOOD_STATUSES,DELIVERY_PROGRAMS,DATASETS} from './constants.mjs';
import {fetchAtlas,normalizeGliders,GLIDERS_URL} from './additional-sources.mjs';
import {fetchArgo} from './argo-source.mjs';
import {fetchIOOS} from './ioos-source.mjs';
import {fetchVoto} from './voto-source.mjs';
import {fetchOAM} from './oam-source.mjs';
import {fetchAVMap} from './avmap-source.mjs';
export const INTERVAL=300,RETENTION=86400;
const CLIMATE_URL='https://climateviewer.org/layers/geojson/2018/UAV-Drones-over-USA-ClimateViewer-3D.geojson';
const CLIMATE_PAGE='https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/';
export const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const clean=(v,n=200)=>String(v??'').replaceAll('\0','').trim().slice(0,n);
export class SourceError extends Error{constructor(message,retry=300){super(message);this.retry=retry;}}
export async function fetchText(url,max=12000000){
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'DRONE-MAPPER/1.0 (https://dronemapper.churchofmalware.org; five-minute shared collection)'},signal:AbortSignal.timeout(20000),redirect:'manual'});
 if(!response.ok){const r=response.headers.get('Retry-After');const seconds=/^\d+$/.test(r||'')?Number(r):Math.max(0,(Date.parse(r)-Date.now())/1000);throw new SourceError(`HTTP ${response.status}`,response.status===429?Math.max(INTERVAL,Math.min(86400,Number.isFinite(seconds)?seconds:INTERVAL)):INTERVAL);}
 if(Number(response.headers.get('content-length'))>max)throw new SourceError('Oversized response');
 const reader=response.body.getReader(),parts=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new SourceError('Oversized response');parts.push(value);}}catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return new TextDecoder().decode(bytes);
}
export async function fetchJSON(url,max=12000000){return JSON.parse(await fetchText(url,max));}
export function normalizeDeploy(payload,now=Date.now()/1000){
 if(!Array.isArray(payload?.features))throw new SourceError('Invalid deployment collection');
 const records=new Map(),yearNow=new Date(now*1000).getUTCFullYear();
 for(const f of payload.features){const p=f?.properties,g=f?.geometry;if(!p||!g||!Object.hasOwn(KINDS,p.formFactor)||!GOOD_STATUSES.includes(p.status)||EXCLUDE_MODELS.includes(p.modelName))continue;
  if(g.type!=='Point'||!Array.isArray(g.coordinates))continue;const [lon,lat]=g.coordinates;
  if(!finite(lat,-90,90)||!finite(lon,-180,180)||(lat===0&&lon===0))continue;
  const slug=clean(p.slug,250),model=clean(p.modelName),place=clean(p.locationName);if(!slug||!model||!place||['global','worldwide','various','multiple locations'].includes(place.toLowerCase()))continue;
  const year=p.startYear;if(year!=null&&(!finite(year,1900,yearNow)||!Number.isInteger(year)))continue;
  const canonical=p.deploymentUrl;if(typeof canonical!=='string'||!canonical.startsWith('/deployments/')||canonical.includes('..'))continue;
  const [kind,domain]=KINDS[p.formFactor],evidence=DELIVERY_PROGRAMS[`${p.companySlug}|${model}`]||null;
  records.set(slug,{id:'deployment:'+slug,record_type:'activity',kind,domain,name:model,model,manufacturer:clean(p.companyName)||null,operator:p.operatorType==='maker_operated'?clean(p.companyName)||null:null,purpose:p.formFactor==='sidewalk'||evidence?'delivery':'unknown',purpose_evidence_url:evidence,latitude:lat,longitude:lon,place,status:p.status==='pilot'?'pilot':'reported-operational',first_year:year??null,observed_at:null,precision:'Approximate deployment area',source:'deploy',source_url:DEPLOY_URL,evidence_url:'https://registry.deploy.report'+canonical,verification:'Published deployment record; not independently field-verified'});
 }return [...records.values()];
}
export function normalizeADSB(payload,now=Date.now()/1000){
 if(!Array.isArray(payload?.ac)||!finite(payload.now,0,1e14))throw new SourceError('Invalid position collection');
 const sourceTime=payload.now>1e11?payload.now/1000:payload.now;if(sourceTime>now+30||now-sourceTime>RETENTION)throw new SourceError('Invalid source time');
 const records=[];for(const a of payload.ac){if(!a||!Object.hasOwn(UAV_TYPES,a.t)||a.simulated===true||a.test_broadcast===true)continue;
  const p=a.lat!=null&&a.lon!=null?a:a.lastPosition||{};if(!finite(p.lat,-90,90)||!finite(p.lon,-180,180)||!finite(p.seen_pos,0,RETENTION))continue;
  const observed=sourceTime-p.seen_pos,id=clean(a.hex,12);if(now-observed>RETENTION||observed>now+5||!id||!/^[~a-f0-9]+$/i.test(id))continue;
  const [manufacturer,model]=UAV_TYPES[a.t];const r={id:'aircraft:'+id,record_type:'position',kind:'drone',domain:'air',name:model,model,manufacturer,operator:null,purpose:'unknown',latitude:p.lat,longitude:p.lon,observed_at:observed,status:'observed',precision:'Broadcast position',registration:clean(a.r,40)||null,callsign:clean(a.flight,30)||null,type_code:a.t,source:'adsb',source_url:ADSB_URL,evidence_url:'https://www.faa.gov/air_traffic/publications/atpubs/cnt_html/',verification:'Unmanned type family; subtype and operator not verified',trail:[]};
  if(p===a){if(finite(a.alt_geom,-3000,100000))Object.assign(r,{altitude_m:a.alt_geom*.3048,altitude_reference:'WGS84'});if(finite(a.gs,0,1500))r.speed_mps=a.gs*.514444;if(finite(a.track,0,359.999))r.heading_deg=a.track;}records.push(r);
 }return records;
}
export function normalizeNOAA(payload,dataset,now=Date.now()/1000){
 const table=payload?.table;if(JSON.stringify(table?.columnNames)!==JSON.stringify(['time','latitude','longitude'])||JSON.stringify(table?.columnUnits)!==JSON.stringify(['UTC','degrees_north','degrees_east'])||!Array.isArray(table?.rows)||table.rows.length>100)throw new SourceError('Invalid ocean table');
 let result=null;const [id,name,model]=dataset;for(const row of table.rows){if(!Array.isArray(row)||row.length!==3)throw new SourceError('Invalid ocean row');const [stamp,lat,lon]=row,observed=typeof stamp==='string'&&stamp.endsWith('Z')?Date.parse(stamp)/1000:NaN;if(!finite(observed,now-RETENTION,now+5)||!finite(lat,-90,90)||!finite(lon,-180,180))continue;
  const r={id:'noaa:pmel:'+id,kind:'surface-vessel',domain:'water',name,model,operator:'NOAA AOML / PMEL mission',purpose:'research',latitude:lat,longitude:lon,observed_at:observed,record_type:'position',source:'NOAA AOML / PMEL',source_url:`https://data.pmel.noaa.gov/pmel/erddap/tabledap/${id}.html`,evidence_url:'https://www.pmel.noaa.gov/usv-hurricane/',license:'CC0-1.0',precision:'Measured position',status:'observed'};if(!result||observed>result.observed_at)result=r;
 }return result;
}
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,x)=>{if(x[0]==='#'){const n=parseInt(x.slice(x[1]?.toLowerCase()==='x'?2:1),x[1]?.toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[x.toLowerCase()]||_;});
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const field=(text,label,next)=>clean(text.match(new RegExp(escapeRE(label)+'\\s*(.*?)(?='+next.map(escapeRE).join('|')+'|$)'))?.[1]||'',250);
export async function normalizeClimate(payload){
 if(!Array.isArray(payload?.features))throw new SourceError('Invalid historical map');const records=new Map();
 for(const f of payload.features){const p=f?.properties,g=f?.geometry;if(!p||g?.type!=='Point'||!Array.isArray(g.coordinates))continue;const [lon,lat]=g.coordinates;if(!finite(lat,-90,90)||!finite(lon,-180,180)||(lat===0&&lon===0))continue;
  const raw=String(p.description||'').slice(0,100000),text=decode(raw.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(),name=clean(p.name);if(!name)continue;
  let operator,model,place,status,dates='';
  if(text.includes('Governmental Body/Entity:')&&text.includes('Type of Drone:')){operator=field(text,'Governmental Body/Entity:',['Type of Drone:']);model=field(text,'Type of Drone:',['Status:']);place=field(text,'General Location of Drone Activity:',['Stated objective/purpose of COA:']);dates=field(text,'Effective Dates:',['Comments:','Link to Records:']);status='historical-authorization';}
  else if(text.includes('Service Branch:')&&text.includes('Types of UAS:')&&text.includes('UAS Activities Status:')){if(field(text,'UAS Activities Status:',['Source:','Location Details:']).toLowerCase()!=='current')continue;operator=field(text,'Service Branch:',['Types of UAS:']);model=field(text,'Types of UAS:',['UAS Activities Status:']);place=name;status='historical-base';}else continue;
  if(!operator||!model)continue;const purpose=/\b(police|sheriff|fire|emergency|public safety)\b/i.test(operator)?'public-safety':/\b(air force|army|navy|marine corps|special operations command)\b/i.test(operator)?'defense':'unknown';
  const years=(dates.match(/\b(?:19|20)\d{2}\b/g)||[]).map(Number).filter(x=>x<=2018),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([name,lat,lon,model,dates].join('|'))),id='history:'+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,18);
  const evidence=decode(raw.match(/href=["'](https:\/\/www\.eff\.org\/[^"']+)["']/i)?.[1]||CLIMATE_PAGE);
  records.set(id,{id,record_type:'historical',kind:'drone',domain:'air',name,model,manufacturer:null,operator,purpose,latitude:lat,longitude:lon,place:place||name,status,first_year:years.length?Math.min(...years):null,record_dates:dates||null,archive_year:2018,observed_at:null,precision:'Historical reported area; not a vehicle position',source:'climateviewer',source_url:CLIMATE_URL,evidence_url:evidence,attribution:'Jim Lee / ClimateViewer — adapted historical map data',license:'CC BY-NC-SA 4.0',license_url:'https://creativecommons.org/licenses/by-nc-sa/4.0/',verification:'Historical published authorization/base record; current activity unverified'});
 }return [...records.values()];
}
async function ocean(){let index=0,failed=0,retry=300;const records=[];await Promise.all(Array.from({length:4},async()=>{while(index<DATASETS.length){const dataset=DATASETS[index++];try{const p=await fetchJSON(`https://data.pmel.noaa.gov/pmel/erddap/tabledap/${dataset[0]}.json?time,latitude,longitude&orderByMax(%22time%22)`,65536),r=normalizeNOAA(p,dataset);if(r)records.push(r);}catch(e){failed++;retry=Math.max(retry,e.retry||300);}}}));if(failed===DATASETS.length)throw new SourceError('Ocean sources unavailable',retry);return {records,partial:failed};}
export const adapters={ioos:()=>fetchIOOS(fetchJSON),argo:()=>fetchArgo(fetchJSON),voto:()=>fetchVoto(fetchJSON),oam:()=>fetchOAM(fetchJSON),avmap:()=>fetchAVMap(fetchText,fetchJSON),deploy:async()=>({records:normalizeDeploy(await fetchJSON(DEPLOY_URL))}),adsb:async()=>({records:normalizeADSB(await fetchJSON(ADSB_URL))}),climateviewer:async()=>({records:await normalizeClimate(await fetchJSON(CLIMATE_URL))}),noaa:ocean,atlas:()=>fetchAtlas(fetchJSON),gliders:async()=>({records:normalizeGliders(await fetchJSON(GLIDERS_URL,1048576))})};
const privateFields=new Set(['source','source_url','evidence_url','verification','purpose_evidence_url','attribution','license','license_url']);
export const publicRecord=r=>Object.fromEntries(Object.entries(r).filter(([key])=>!privateFields.has(key)));
export function mergePositions(previous,incoming,now){
 const retained=new Map(previous.filter(r=>r.record_type==='position'&&now-r.observed_at<RETENTION).map(r=>[r.id,r]));
 const out=[];for(const record of incoming){if(!finite(record.latitude,-90,90)||!finite(record.longitude,-180,180)||!['position','activity','historical'].includes(record.record_type))throw new SourceError('Invalid adapter record');
  if(record.record_type==='position'){if(!finite(record.observed_at,now-RETENTION,now+5))throw new SourceError('Invalid observation time');const old=retained.get(record.id);retained.delete(record.id);if(old?.observed_at>record.observed_at){out.push(old);continue;}let trail=[...(old?.trail||[])];if(trail.at(-1)?.observed_at!==record.observed_at)trail.push({latitude:record.latitude,longitude:record.longitude,observed_at:record.observed_at});record.trail=trail.filter(p=>now-p.observed_at<RETENTION).slice(-600);}out.push(record);
 }return out.concat([...retained.values()]);
}
