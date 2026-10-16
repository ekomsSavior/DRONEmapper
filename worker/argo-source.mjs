// Church of Malware / saviorSEC · AGPL-3.0-or-later
// Public Argo profiling-float surface fixes; no inferred underwater positions.
export const ARGO_BASE='https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats';
export const ARGO_CREDIT='International Argo Program and contributing national programs, part of the Global Ocean Observing System; Argo GDAC via Ifremer; https://doi.org/10.17882/42182';
export const ARGO_COLUMNS=['platform_number','platform_type','time','time_location','latitude','longitude','position_qc','time_qc','positioning_system'];
const units=[null,null,'UTC','UTC','degrees_north','degrees_east',null,null,null];
const number=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)?Date.parse(v)/1000:NaN;
export function argoUrl(now=Date.now()/1000){
 const iso=t=>new Date(Math.floor(t)*1000).toISOString().replace('.000Z','Z');
 return ARGO_BASE+'.json?'+ARGO_COLUMNS.join(',')+'&time%3E='+iso(now-86400)+'&time%3C='+iso(now)+'&distinct()';
}
export function normalizeArgo(payload,now=Date.now()/1000){
 const t=payload?.table;
 if(JSON.stringify(t?.columnNames)!==JSON.stringify(ARGO_COLUMNS)||JSON.stringify(t?.columnUnits)!==JSON.stringify(units)||!Array.isArray(t?.rows)||t.rows.length>10000)throw Error('Invalid Argo table');
 const newest=new Map();
 for(const row of t.rows){
  if(!Array.isArray(row)||row.length!==9)throw Error('Invalid Argo row');
  const [wmo,model,profileTime,positionTime,lat,lon,pq,tq,method]=row,observed=stamp(positionTime),profile=stamp(profileTime);
  if(typeof wmo!=='string'||!/^\d{7}$/.test(wmo)||typeof model!=='string'||! /^[A-Z0-9_ -]{1,64}$/.test(model)||pq!=='1'||tq!=='1'||!['GPS','ARGOS','IRIDIUM'].includes(method)||!number(profile,now-86400,now+5)||!number(observed,now-86400,now+5)||!number(lat,-90,90)||!number(lon,-180,180)||(lat===0&&lon===0))continue;
  if(newest.has(wmo)&&newest.get(wmo).observed_at>=observed)continue;
  newest.set(wmo,{id:'argo:'+wmo,wmo_id:wmo,record_type:'position',kind:'profiling-float',domain:'water',name:'Argo '+wmo,model,manufacturer:null,operator:null,purpose:'research',latitude:lat,longitude:lon,observed_at:observed,profile_at:profile,status:'observed',position_basis:'reported',position_method:method.toLowerCase(),precision:'Last reported surface fix; current underwater position unknown',source:'argo',source_url:ARGO_BASE+'.html',evidence_url:'https://doi.org/10.17882/42182',attribution:ARGO_CREDIT,license:'Argo unrestricted data use; attribution requested',license_url:'https://argo.ucsd.edu/data/acknowledging-argo/'});
 }
 return [...newest.values()];
}
export async function fetchArgo(fetchJSON,now=Date.now()/1000){return {records:normalizeArgo(await fetchJSON(argoUrl(now),2097152),now)};}
