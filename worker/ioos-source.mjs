// IOOS Glider DAC: verified Spray surface GPS reports, CC BY 4.0.
import {deduplicateGliderPositions} from './voto-source.mjs';
export const IOOS_BASE='https://gliders.ioos.us/erddap';
const datasetId=/^sp\d{3}-\d{8}T\d{4}$/;
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const stamp=v=>typeof v==='string'&&v.endsWith('Z')?Date.parse(v)/1000:NaN;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function ioosCatalogUrl(now=Date.now()/1000){return IOOS_BASE+'/tabledap/allDatasets.json?datasetID,title,maxTime&maxTime%3E='+new Date((now-86400)*1000).toISOString().replace('.000Z','Z');}
export function ioosDatasets(payload,now=Date.now()/1000){
 const t=payload?.table;if(!same(t?.columnNames,['datasetID','title','maxTime'])||!Array.isArray(t.rows))throw Error('Invalid IOOS catalog');
 const ids=new Set();for(const r of t.rows){if(!Array.isArray(r)||r.length!==3)throw Error('Invalid IOOS catalog row');if(typeof r[0]==='string'&&datasetId.test(r[0])&&finite(stamp(r[2]),now-86400,now+5))ids.add(r[0]);}
 if(ids.size>32)throw Error('Unexpected IOOS Spray fleet size');return [...ids].sort();
}
export function ioosMetadata(payload,id){
 if(!datasetId.test(id))throw Error('Invalid IOOS dataset identifier');
 const t=payload?.table;if(!same(t?.columnNames,['Row Type','Variable Name','Attribute Name','Data Type','Value'])||!Array.isArray(t.rows))throw Error('Invalid IOOS metadata');
 const a=new Map();for(const r of t.rows){if(!Array.isArray(r)||r.length!==5)throw Error('Invalid IOOS metadata row');if(r[0]==='attribute')a.set(r[1]+':'+r[2],r[4]);}
 const get=(v,k)=>a.get(v+':'+k),platform=id.split('-')[0],wmo=get('platform','wmo_id'),operator=get('NC_GLOBAL','institution');
 if(get('NC_GLOBAL','platform_type')!=='Spray Glider'||get('platform','id')!==platform||!/^\d{7}$/.test(wmo||'')||
 !['Scripps Institution of Oceanography','Woods Hole Oceanographic Institution'].includes(operator)||
 get('platform','platform_maker')!=='Scripps Institution of Oceanography Instrument Development Group'||
 !String(get('NC_GLOBAL','license')).includes('https://creativecommons.org/licenses/by/4.0/')||
 get('gps_end_lat','units')!=='degrees_north'||get('gps_end_lon','units')!=='degrees_east'||
 get('gps_end_time','units')!=='seconds since 1970-01-01T00:00:00Z'||
 !String(get('gps_end_lat','comment')).includes('GPS at surface')||!String(get('gps_end_time','comment')).includes('GPS time')||
 get('gps_end_qc','flag_values')!=='1, 2, 3, 4, 9'||get('gps_end_qc','flag_meanings')!=='good not_evaluated questionable bad missing')throw Error('Unverified IOOS surface GPS metadata');
 return {dataset_id:id,platform_id:platform,wmo_id:wmo,operator};
}
export function ioosPositionUrl(id){
 if(!datasetId.test(id))throw Error('Invalid IOOS dataset identifier');
 return IOOS_BASE+'/tabledap/'+id+'.json?wmo_id,gps_end_time,gps_end_lat,gps_end_lon,gps_end_qc&gps_end_qc=1&orderByMax(%22gps_end_time%22)';
}
export function normalizeIOOS(payload,meta,now=Date.now()/1000){
 const t=payload?.table;if(!same(t?.columnNames,['wmo_id','gps_end_time','gps_end_lat','gps_end_lon','gps_end_qc'])||!same(t?.columnUnits,[null,'UTC','degrees_north','degrees_east',null])||!Array.isArray(t.rows)||t.rows.length>100)throw Error('Invalid IOOS GPS table');
 let newest=null;for(const r of t.rows){if(!Array.isArray(r)||r.length!==5)throw Error('Invalid IOOS GPS row');
 const [wmo,date,lat,lon,qc]=r,observed=stamp(date);
 if(wmo!==meta.wmo_id||qc!==1||!finite(observed,now-86400,now+5)||!finite(lat,-90,90)||!finite(lon,-180,180)||(lat===0&&lon===0)||(newest&&newest.observed_at>=observed))continue;
 const page=IOOS_BASE+'/tabledap/'+meta.dataset_id+'.html';
 newest={id:'ioos:'+wmo,wmo_id:wmo,platform_id:meta.platform_id,record_type:'position',kind:'underwater',domain:'water',
 name:'Spray '+meta.platform_id,model:'Spray glider',manufacturer:'Scripps Institution of Oceanography Instrument Development Group',operator:meta.operator,purpose:'research',
 latitude:lat,longitude:lon,observed_at:observed,status:'observed',position_basis:'measured',position_method:'surface-gps',position_quality:'Provider GPS QC passed (1)',
 precision:'Surface GPS at dive end; no underwater position inferred',source:'ioos',source_url:page,evidence_url:page,
 attribution:meta.operator+' / IOOS Glider DAC; adapted surface GPS subset',license:'CC BY 4.0',license_url:'https://creativecommons.org/licenses/by/4.0/'};
 }return newest?[newest]:[];
}
export async function fetchIOOS(fetchJSON,now=Date.now()/1000){
 const ids=ioosDatasets(await fetchJSON(ioosCatalogUrl(now),1048576),now),records=[];let index=0;
 // Limit simultaneous provider requests; a failed refresh preserves the previous snapshot.
 await Promise.all(Array.from({length:Math.min(3,ids.length)},async()=>{while(index<ids.length){const id=ids[index++],meta=ioosMetadata(await fetchJSON(IOOS_BASE+'/info/'+id+'/index.json',1048576),id);records.push(...normalizeIOOS(await fetchJSON(ioosPositionUrl(id),65536),meta,now));}}));
 return {records:deduplicateGliderPositions(records.sort((a,b)=>a.id.localeCompare(b.id)))};
}
