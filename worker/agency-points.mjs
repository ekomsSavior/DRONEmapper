// Roselle's public deployment log supplies calendar days and operation points.
// Keep date-only precision and generalize locations to a receiver-sized area.
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const fields='OBJECTID,Date_Text,USER_Date_,USER_Total_Duration_of_Flight,General_Category';
export function pointRevision(meta){
 if(meta?.error||meta?.geometryType!=='esriGeometryPoint'||meta.objectIdField!=='OBJECTID'||meta.advancedQueryCapabilities?.supportsPagination!==true||meta.dateFieldsTimeReference?.timeZone!=='UTC')throw Error('Published operation schema changed');
 const types=new Map((meta.fields||[]).map(f=>[f.name,f.type]));
 for(const [key,type] of Object.entries({OBJECTID:'OID',Date_Text:'String',USER_Date_:'Date',USER_Total_Duration_of_Flight:'String',General_Category:'String'}))if(types.get(key)!=='esriFieldType'+type)throw Error('Published operation fields changed');
 const revision=meta.editingInfo?.lastEditDate;if(!finite(revision,1,1e14))throw Error('Missing operation revision');return revision;
}
export function durationMinutes(value){
 const m=typeof value==='string'&&value.trim().toLowerCase().match(/^(?:(\d+)\s*hours?\s*)?(?:(\d+)\s*mins?\s*)?$/);
 if(!m||!m[1]&&!m[2])return null;const n=Number(m[1]||0)*60+Number(m[2]||0);return n>0&&n<=1440?n:null;
}
export function normalizeOperationPoints(features,agency,now=Date.now()/1000){
 if(!Array.isArray(features))throw Error('Invalid operation features');const records=[],seen=new Set();
 for(const f of features){
  const p=f?.attributes,g=f?.geometry;
  if(!p||!Number.isSafeInteger(p.OBJECTID)||p.OBJECTID<0||seen.has(p.OBJECTID))throw Error('Invalid or repeated operation identifier');seen.add(p.OBJECTID);
  const m=typeof p.Date_Text==='string'&&p.Date_Text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!m||!finite(p.USER_Date_,946684800000,now*1000))continue;
  const day=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if(new Date(p.USER_Date_).toISOString().slice(0,10)!==day)continue;
  if(!g||!finite(g.x,-180,180)||!finite(g.y,-90,90)||g.x===0&&g.y===0)continue;
  const west=Math.floor(g.x*100)/100,south=Math.floor(g.y*100)/100,east=Number((west+.01).toFixed(2)),north=Number((south+.01).toFixed(2));
  if(east>180||north>90)continue;
  const purpose=typeof p.General_Category==='string'?p.General_Category.replace(/[\x00-\x1f]/g,' ').trim().slice(0,180):'';
  records.push({id:`police-flight:${agency.id}:${p.OBJECTID}`,record_type:'historical',status:'published-flight',kind:'drone',domain:'air',name:agency.agency+' operation · '+day,model:null,manufacturer:null,operator:agency.agency,purpose:'public-safety',latitude:Number((south+.005).toFixed(3)),longitude:Number((west+.005).toFixed(3)),flight_area:[south,west,north,east],place:agency.place,event_date:day,record_dates:day,reported_duration_minutes:durationMinutes(p.USER_Total_Duration_of_Flight),flight_purpose:purpose||'Not reported',observed_at:null,live:false,precision:'Published operation point generalized to a 0.01° area; date only, not aircraft GPS',source:'police-'+agency.id,source_url:agency.layer,evidence_url:agency.official,agency_portal:agency.portal,attribution:agency.agency+' / public drone deployment log',verification:'Agency-published operation; original calendar date, launch time not supplied'});
 }
 return records;
}
export async function fetchOperationPoints(fetchJSON,agency,previous={},now=Date.now()/1000){
 const before=pointRevision(await fetchJSON(agency.layer+'?f=json',262144)),revision=String(before);
 if(previous.source_revision===revision&&Array.isArray(previous.records))return {...previous,refresh_after:agency.refresh_seconds};
 const count=await fetchJSON(agency.layer+'/query?'+new URLSearchParams({f:'json',where:'1=1',returnCountOnly:'true'}),65536);
 if(count.error||!Number.isSafeInteger(count.count)||count.count<0)throw Error('Invalid operation count');
 const target=Math.min(count.count,agency.max_records),features=[];
 for(let offset=0;offset<target;offset+=1000){
  const size=Math.min(1000,target-offset),q=new URLSearchParams({f:'json',where:'1=1',outFields:fields,outSR:'4326',returnGeometry:'true',geometryPrecision:'3',orderByFields:'USER_Date_ DESC,OBJECTID DESC',resultOffset:String(offset),resultRecordCount:String(size)});
  const batch=await fetchJSON(agency.layer+'/query?'+q,2000000);
  if(batch.error||batch.spatialReference?.wkid!==4326||!Array.isArray(batch.features)||batch.features.length!==size)throw Error('Incomplete operation page');features.push(...batch.features);
 }
 if(pointRevision(await fetchJSON(agency.layer+'?f=json',262144))!==before)throw Error('Operation layer changed during collection');
 const records=normalizeOperationPoints(features,agency,now);if(target&&!records.length)throw Error('No usable operation dates or areas');
 return {records,source_revision:revision,refresh_after:agency.refresh_seconds,coverage:{published_rows:count.count,selected_rows:target,mapped_records:records.length,filtered_or_duplicate_rows:target-records.length,omitted_rows:count.count-target,window_days:null,record_limit:agency.max_records}};
}
