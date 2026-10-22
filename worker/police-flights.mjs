// Published SFPD operation areas. These records are never aircraft telemetry.
export const SFPD_PAGE='https://data.sf.gov/d/giw5-ttjs';
export const SFPD_META='https://data.sf.gov/api/views/giw5-ttjs.json';
export const SFPD_URL='https://data.sf.gov/resource/giw5-ttjs.json';
export const SFPD_SELECT=':id as source_row_id,date,flight_duration_minutes,reason_for_flight,point,analysis_neighborhood,data_loaded_at';
export const SFPD_REFRESH=3600;
const PAGE_SIZE=2000,MAX_PAGES=25;
const finite=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const clean=(x,n=160)=>typeof x==='string'?x.replaceAll('\0','').trim().slice(0,n):'';
const purposes=new Map(['Criminal Investigation','Training/Test','Major or Critical Incidents','Fire/Mutual Aid'].map(x=>[x.toLowerCase().replace(/\s/g,''),x]));
export function flightDate(value,today=new Date().toISOString().slice(0,10)){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)?$/.test(value))return null;
 const day=value.slice(0,10),stamp=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===day&&day>='2024-05-16'&&day<=today?day:null;
}
export function normalizeSFPD(rows,today){
 if(!Array.isArray(rows))throw Error('Invalid SFPD flight rows');
 const records=new Map();
 for(const p of rows){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid SFPD flight row');
  const id=p.source_row_id,day=flightDate(p.date,today),g=p.point;
  // Socrata identifiers are opaque, not URL slugs. Preserve punctuation exactly.
  if(typeof id!=='string'||!/^[\x21-\x7e]+$/.test(id)||id.length<1||id.length>200)throw Error('Invalid SFPD row identifier');
  if(records.has(id))throw Error('Duplicate SFPD row identifier');
  if(!day||g?.type!=='Point'||!Array.isArray(g.coordinates)||g.coordinates.length!==2)continue;
  const [lon,lat]=g.coordinates;
  // The source suppresses locations outside SF. Do not geocode absent points.
  if(!finite(lat,37.6,37.9)||!finite(lon,-122.6,-122.3))continue;
  const raw=p.flight_duration_minutes;
  const duration=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;
  const purpose=purposes.get(clean(p.reason_for_flight).toLowerCase().replace(/\s/g,''))||'Other / unspecified';
  const place=clean(p.analysis_neighborhood);
  records.set(id,{id:'sfpd-flight:'+id,record_type:'historical',kind:'drone',domain:'air',name:'SFPD drone flight · '+day,model:null,manufacturer:null,operator:'San Francisco Police Department',purpose:'public-safety',latitude:lat,longitude:lon,place:place?place+', San Francisco':'San Francisco',status:'published-flight',record_dates:day,event_date:day,observed_at:null,flight_purpose:purpose,reported_duration_minutes:finite(duration,0,1440)?duration:null,publication_date:flightDate(p.data_loaded_at,today),precision:'Published operation area; intersection or 100-block, not aircraft GPS',source:'sfpd',source_url:SFPD_URL,evidence_url:SFPD_PAGE,attribution:'City and County of San Francisco / San Francisco Police Department',license:'PDDL-1.0',license_url:'https://opendatacommons.org/licenses/pddl/1.0/',verification:'Agency-published flight log; monthly publication'});
 }return [...records.values()];
}
function revision(meta){
 if(meta?.id!=='giw5-ttjs'||meta.licenseId!=='PDDL'||!finite(meta.rowsUpdatedAt,1,1e11))throw Error('Invalid SFPD dataset metadata');
 const fields=new Map((meta.columns||[]).map(c=>[c.fieldName,c.dataTypeName]));
 for(const [name,type] of Object.entries({date:'calendar_date',point:'point',flight_duration_minutes:'number',reason_for_flight:'text',analysis_neighborhood:'text',data_loaded_at:'calendar_date'}))if(fields.get(name)!==type)throw Error('SFPD schema changed');
 return meta.rowsUpdatedAt;
}
export async function fetchSFPD(fetchJSON){
 const before=revision(await fetchJSON(SFPD_META)),rows=[],seen=new Set();let finished=false;
 for(let page=0;page<MAX_PAGES;page++){
  const query=new URLSearchParams({'$select':SFPD_SELECT,'$order':':id','$limit':String(PAGE_SIZE),'$offset':String(page*PAGE_SIZE)});
  const batch=await fetchJSON(SFPD_URL+'?'+query);
  if(!Array.isArray(batch)||batch.length>PAGE_SIZE)throw Error('Invalid SFPD page');
  for(const r of batch){const id=r?.source_row_id;if(typeof id!=='string'||seen.has(id))throw Error('Incomplete SFPD pagination');seen.add(id);rows.push(r);}
  if(batch.length<PAGE_SIZE){finished=true;break;}
 }
 if(!finished)throw Error('SFPD pagination limit reached');
 if(revision(await fetchJSON(SFPD_META))!==before)throw Error('SFPD dataset changed during collection');
 const records=normalizeSFPD(rows);
 if(rows.length&&!records.length)throw Error('No usable SFPD coordinates or dates');
 return {records,refresh_after:SFPD_REFRESH};
}
