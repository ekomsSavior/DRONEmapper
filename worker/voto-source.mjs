// VOTO public CC BY 4.0 glider reports. No locally generated positions.
export const VOTO_BASE='https://erddap.observations.voiceoftheocean.org/erddap';
export const VOTO_CREDIT='Voice of the Ocean Foundation; data collected and made freely available at https://erddap.observations.voiceoftheocean.org/erddap/index.html';
const datasetId=/^nrt_(SEA|SHW)\d+_M\d+$/;
const number=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const stamp=v=>typeof v==='string'&&v.endsWith('Z')?Date.parse(v)/1000:NaN;
export function votoCatalogUrl(now=Date.now()/1000){return VOTO_BASE+'/tabledap/allDatasets.json?datasetID,title,maxTime&maxTime%3E='+new Date((now-86400)*1000).toISOString().replace('.000Z','Z');}
export function votoPositionUrl(id){if(!datasetId.test(id))throw Error('Invalid VOTO dataset identifier');return VOTO_BASE+'/tabledap/'+id+'.json?time,latitude,longitude&latitude%3E=-90&latitude%3C=90&longitude%3E=-180&longitude%3C=180&latitude_qc=1&longitude_qc=1&orderByMax(%22time%22)';}
export function votoDatasets(payload,now=Date.now()/1000){
 const t=payload?.table;if(JSON.stringify(t?.columnNames)!==JSON.stringify(['datasetID','title','maxTime'])||!Array.isArray(t?.rows))throw Error('Invalid VOTO catalog');
 const ids=new Set();for(const row of t.rows){if(!Array.isArray(row)||row.length!==3)throw Error('Invalid VOTO catalog row');const [id,,maximum]=row;if(typeof id==='string'&&datasetId.test(id)&&number(stamp(maximum),now-86400,now+5))ids.add(id);}
 if(ids.size>64)throw Error('Unexpected VOTO fleet size');return [...ids].sort();
}
export function votoMetadata(payload,id){
 if(!datasetId.test(id))throw Error('Invalid VOTO dataset identifier');const t=payload?.table;
 if(JSON.stringify(t?.columnNames)!==JSON.stringify(['Row Type','Variable Name','Attribute Name','Data Type','Value'])||!Array.isArray(t?.rows))throw Error('Invalid VOTO metadata');
 const meta={},comments={},flags={};for(const row of t.rows){if(!Array.isArray(row)||row.length!==5)throw Error('Invalid VOTO metadata row');if(row[0]==='attribute'){if(row[1]==='NC_GLOBAL')meta[row[2]]=row[4];if(row[2]==='comment')comments[row[1]]=row[4];if(row[2].startsWith('flag_'))flags[row[1]+':'+row[2]]=row[4];}}
 const serial=id.split('_')[1];if(String(meta.institution||'').toLowerCase()!=='voice of the ocean foundation'||meta.dataset_id!==id||meta.glider_serial!==serial||meta.glider_model!=='SeaExplorer'||meta.source!=='Observational data from a profiling glider.'||!/^\d{7}$/.test(String(meta.wmo_id||''))||!String(meta.license||'').includes('creativecommons.org/licenses/by/4.0/')||['latitude','longitude'].some(v=>comments[v]!=='Estimated between surface fixes'))throw Error('Unverified VOTO glider metadata');
 if(['latitude_qc','longitude_qc'].some(v=>flags[v+':flag_meanings']!=='GOOD, UNKNOWN, SUSPECT, FAIL, MISSING'||flags[v+':flag_values']!=='1, 2, 3, 4, 9'))throw Error('Unverified VOTO position quality flags');
 meta.glider_name=String(meta.glider_name||serial).replaceAll('\0','').trim().slice(0,120);return meta;
}
export function normalizeVoto(payload,meta,now=Date.now()/1000){
 const t=payload?.table;if(JSON.stringify(t?.columnNames)!==JSON.stringify(['time','latitude','longitude'])||JSON.stringify(t?.columnUnits)!==JSON.stringify(['UTC','degrees_north','degrees_east'])||!Array.isArray(t?.rows)||t.rows.length>100)throw Error('Invalid VOTO position table');
 let newest=null;for(const row of t.rows){if(!Array.isArray(row)||row.length!==3)throw Error('Invalid VOTO position row');const [date,lat,lon]=row,observed=stamp(date);if(!number(observed,now-86400,now+5)||!number(lat,-90,90)||!number(lon,-180,180)||(lat===0&&lon===0)||(newest&&newest.observed_at>=observed))continue;
  const page=VOTO_BASE+'/tabledap/'+meta.dataset_id+'.html';newest={id:'voto:'+meta.wmo_id,wmo_id:meta.wmo_id,record_type:'position',kind:'underwater',domain:'water',name:meta.glider_name+' ('+meta.glider_serial+')',model:'SeaExplorer',manufacturer:'ALSEAMAR',operator:'Voice of the Ocean Foundation',purpose:'research',latitude:lat,longitude:lon,observed_at:observed,status:'observed',position_basis:'reported',position_method:'provider-estimated',precision:'Provider-estimated between surface fixes; no extrapolation',source:'voto',source_url:page,evidence_url:page,attribution:VOTO_CREDIT,license:'CC BY 4.0',license_url:'https://creativecommons.org/licenses/by/4.0/'};
 }return newest?[newest]:[];
}
export function deduplicateGliderPositions(records){
 const result=[],indices=new Map();for(const r of records){const wmo=r.wmo_id||(/^glider:\d{7}$/.test(r.id||'')?r.id.split(':')[1]:null);if(r.kind!=='underwater'||!/^\d{7}$/.test(String(wmo||''))){result.push(r);continue;}if(!indices.has(wmo)){indices.set(wmo,result.length);result.push(r);}else{const i=indices.get(wmo);if((r.observed_at||0)>(result[i].observed_at||0))result[i]=r;}}return result;
}
export async function fetchVoto(fetchJSON,now=Date.now()/1000){
 const records=[];for(const id of votoDatasets(await fetchJSON(votoCatalogUrl(now)),now)){const meta=votoMetadata(await fetchJSON(VOTO_BASE+'/info/'+id+'/index.json'),id);records.push(...normalizeVoto(await fetchJSON(votoPositionUrl(id)),meta,now));}
 return {records:deduplicateGliderPositions(records)};
}
