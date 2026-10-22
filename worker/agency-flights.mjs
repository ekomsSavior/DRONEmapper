// Factual records from agency-published public flight layers. No aircraft telemetry.
import agencies from '../public/police-flight-sources.json' with {type:'json'};
export {agencies};
const PAGE=1000;
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const fields='ObjectId,flight_id,takeoff,landing,flight_purpose';
export function layerRevision(meta){
 if(meta?.error||meta?.geometryType!=='esriGeometryPolyline'||meta.objectIdField!=='ObjectId'||meta.extent?.spatialReference?.wkid!==4326||meta.advancedQueryCapabilities?.supportsReturningGeometryEnvelope!==true)throw Error('Published flight schema changed');
 const types=new Map((meta.fields||[]).map(f=>[f.name,f.type]));
 for(const [key,type] of Object.entries({ObjectId:'esriFieldTypeOID',flight_id:'esriFieldTypeString',takeoff:'esriFieldTypeDate',landing:'esriFieldTypeDate',flight_purpose:'esriFieldTypeString'}))if(types.get(key)!==type)throw Error('Published flight fields changed');
 const revision=meta.editingInfo?.lastEditDate;
 if(!finite(revision,1,1e14))throw Error('Missing published flight revision');
 return revision;
}
export function normalizeAgencyFlights(features,agency,now=Date.now()/1000){
 if(!Array.isArray(features))throw Error('Invalid public flight features');
 const records=new Map(),seen=new Set(),conflicts=new Set();
 for(const f of features){
  const p=f?.attributes,g=f?.envelope;
  if(!p||!Number.isSafeInteger(p.ObjectId)||p.ObjectId<0||!uuid(p.flight_id)||seen.has(p.ObjectId))throw Error('Invalid or repeated public flight identifier');
  seen.add(p.ObjectId);
  if(!finite(p.takeoff,946684800000,now*1000)||!finite(p.landing,p.takeoff,now*1000)||p.landing-p.takeoff>86400000)continue;
  if(agency.window_days&&p.takeoff<(now-agency.window_days*86400)*1000)continue;
  if(!g||!finite(g.xmin,-180,180)||!finite(g.xmax,g.xmin,180)||!finite(g.ymin,-90,90)||!finite(g.ymax,g.ymin,90)||g.xmax-g.xmin>5||g.ymax-g.ymin>5)continue;
  // Round the envelope outward, not an inferred launch point or incident address.
  const west=Math.floor(g.xmin*1000)/1000,east=Math.ceil(g.xmax*1000)/1000,south=Math.floor(g.ymin*1000)/1000,north=Math.ceil(g.ymax*1000)/1000;
  if(west===0&&east===0&&south===0&&north===0)continue;
  const start=p.takeoff/1000,end=p.landing/1000,day=new Date(p.takeoff).toISOString().slice(0,10);
  const purpose=typeof p.flight_purpose==='string'?p.flight_purpose.replace(/[\x00-\x1f]/g,' ').trim().slice(0,180):'';
  const record={id:`police-flight:${agency.id}:${p.flight_id}`,record_type:'historical',status:'published-flight',kind:'drone',domain:'air',name:agency.agency+' flight · '+day,model:null,manufacturer:null,operator:agency.agency,purpose:'public-safety',latitude:Number(((south+north)/2).toFixed(4)),longitude:Number(((west+east)/2).toFixed(4)),flight_area:[south,west,north,east],place:agency.place,event_date:day,record_dates:day,flight_started_at:start,flight_ended_at:end,reported_duration_minutes:Math.round((end-start)/6)/10,flight_purpose:purpose||'Not reported',observed_at:null,live:false,precision:'Published flight envelope; generalized area, not aircraft GPS or incident address',source:'police-'+agency.id,source_url:agency.layer,evidence_url:agency.official,agency_portal:agency.portal,attribution:agency.agency+' / public flight transparency dashboard',verification:'Agency-published completed flight; publication timing controlled by the agency'};
  const prior=records.get(record.id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(record))conflicts.add(record.id);
  else records.set(record.id,record);
 }
 return [...records.values()].filter(r=>!conflicts.has(r.id));
}
export async function fetchAgencyFlights(fetchJSON,agency,previous={},now=Date.now()/1000){
 const before=layerRevision(await fetchJSON(agency.layer+'?f=json',262144));
 // Daily cache key also expires a rolling publication window without source edits.
 const revision=`${before}:${agency.window_days?Math.floor(now/86400):0}`;
 if(previous.source_revision===revision&&Array.isArray(previous.records))return {records:previous.records,source_revision:revision,refresh_after:agency.refresh_seconds,coverage:previous.coverage};
 const cutoff=agency.window_days?new Date((now-agency.window_days*86400)*1000).toISOString().replace('T',' ').replace(/\.\d+Z$/,''):null;
 const where='landing IS NOT NULL'+(cutoff?` AND takeoff >= TIMESTAMP '${cutoff}'`:'');
 const count=await fetchJSON(agency.layer+'/query?'+new URLSearchParams({f:'json',where,returnCountOnly:'true'}),65536);
 if(count.error||!Number.isSafeInteger(count.count)||count.count<0)throw Error('Invalid public flight count');
 const target=Math.min(count.count,agency.max_records),features=[],ids=new Set();
 for(let offset=0;offset<target;offset+=PAGE){
  const size=Math.min(PAGE,target-offset),query=new URLSearchParams({f:'json',where,outFields:fields,outSR:'4326',returnGeometry:'false',returnEnvelope:'true',geometryPrecision:'3',resultRecordCount:String(size),resultOffset:String(offset),orderByFields:'takeoff DESC,ObjectId DESC'});
  const batch=await fetchJSON(agency.layer+'/query?'+query,2000000);
  if(batch.error||batch.spatialReference?.wkid!==4326||!Array.isArray(batch.features)||batch.features.length!==size)throw Error('Incomplete public flight page');
  for(const f of batch.features){const p=f?.attributes;if(!p||ids.has(p.ObjectId))throw Error('Repeated public flight page');ids.add(p.ObjectId);}
  features.push(...batch.features);
 }
 if(layerRevision(await fetchJSON(agency.layer+'?f=json',262144))!==before)throw Error('Published flight layer changed during collection');
 const records=normalizeAgencyFlights(features,agency,now);
 if(target&&!records.length)throw Error('No usable public flight dates or areas');
 return {records,source_revision:revision,refresh_after:agency.refresh_seconds,coverage:{published_rows:count.count,selected_rows:target,mapped_records:records.length,filtered_or_duplicate_rows:target-records.length,omitted_rows:count.count-target,window_days:agency.window_days,record_limit:agency.max_records}};
}
