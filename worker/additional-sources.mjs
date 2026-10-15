// Public programs and reported ocean positions. No geocoding or interpolation.
export const ATLAS_LAYER='https://services8.arcgis.com/0emesQkjyT7tJv3q/arcgis/rest/services/AOS_CITY/FeatureServer/0';
const ATLAS_FIELDS='AOSNUMBER,Agency,City,County,State,Technology,Summary,Link_1_Date,Link_2_Date,Link_3_Date,ObjectId';
export const GLIDERS_PAGE='https://cwcgom.aoml.noaa.gov/erddap/tabledap/GLIDERS_LAST_10_DAYS_LOCATIONS.html';
export const GLIDERS_URL=GLIDERS_PAGE.slice(0,-5)+'.json?platform_name,time,latitude,longitude&orderByMax(%22platform_name,time%22)';
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const clean=(v,n=200)=>String(v??'').replaceAll('\0','').trim().slice(0,n);
// Conservatively omit ambiguous plans, even when they describe fleet additions.
const unconfirmed=/\b(plan(?:s|ned)? to|intend|not yet|no longer|discontinu|terminat|cancel|propos|has not|never|abandon)/i;
export function normalizeAtlas(payload){
 if(payload?.error||payload?.geometryType!=='esriGeometryPoint'||payload?.spatialReference?.wkid!==4326||!Array.isArray(payload?.features))throw Error('Invalid Atlas map layer');
 const records=new Map();
 for(const f of payload.features){const p=f?.attributes||{},g=f?.geometry||{},id=clean(p.AOSNUMBER),agency=clean(p.Agency),lat=g.y,lon=g.x;
  if(p.Technology!=='Drones'||!/^AOS\d{6,12}$/.test(id)||!agency||!finite(lat,-90,90)||!finite(lon,-180,180)||(lat===0&&lon===0)||unconfirmed.test(p.Summary||''))continue;
  const place=['City','County','State'].map(k=>clean(p[k])).filter(Boolean).join(', ');if(!place)continue;
  const dates=[...new Set([1,2,3].map(n=>clean(p[`Link_${n}_Date`],80)).filter(Boolean))];
  records.set(id,{id:'atlas:'+id,record_type:'activity',kind:'drone',domain:'air',name:agency+' — drone program',model:null,manufacturer:null,operator:agency,purpose:'public-safety',latitude:lat,longitude:lon,place,status:'documented-program',observed_at:null,record_dates:dates.join('; ')||null,precision:'Approximate agency area; not a vehicle position',source:'atlas',source_url:ATLAS_LAYER,evidence_url:'https://www.atlasofsurveillance.org/atlas',attribution:'Electronic Frontier Foundation / Atlas of Surveillance',license:'CC BY 4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',verification:'Documented drone program; continued operation unverified'});
 }return [...records.values()];
}
export async function fetchAtlas(fetchJSON){
 const records=new Map();
 for(let page=0;page<10;page++){
  const query=new URLSearchParams({where:"Technology='Drones'",outFields:ATLAS_FIELDS,outSR:'4326',f:'json',orderByFields:'ObjectId',resultRecordCount:'1999',resultOffset:String(page*1999)});
  const payload=await fetchJSON(ATLAS_LAYER+'/query?'+query);
  for(const r of normalizeAtlas(payload))records.set(r.id,r);
  if(!payload.exceededTransferLimit)return {records:[...records.values()]};
  if(!payload.features.length)throw Error('Incomplete Atlas pagination');
 }throw Error('Atlas pagination limit reached');
}
export function normalizeGliders(payload,now=Date.now()/1000){
 const t=payload?.table;
 if(JSON.stringify(t?.columnNames)!==JSON.stringify(['platform_name','time','latitude','longitude'])||JSON.stringify(t?.columnUnits)!==JSON.stringify([null,'UTC','degrees_north','degrees_east'])||!Array.isArray(t?.rows)||t.rows.length>10000)throw Error('Invalid glider position table');
 const records=new Map();
 for(const row of t.rows){if(!Array.isArray(row)||row.length!==4)throw Error('Invalid glider row');const [id,stamp,lat,lon]=row;
  if(typeof id!=='string'||!/^\d{7}$/.test(id)||typeof stamp!=='string'||!stamp.endsWith('Z')||!finite(lat,-90,90)||!finite(lon,-180,180))continue;
  const observed=Date.parse(stamp)/1000;if(!finite(observed,now-86400,now+5)||(records.get(id)?.observed_at??-Infinity)>=observed)continue;
  records.set(id,{id:'glider:'+id,record_type:'position',kind:'underwater',domain:'water',name:'Glider '+id,model:null,manufacturer:null,operator:null,purpose:'research',latitude:lat,longitude:lon,observed_at:observed,status:'observed',position_basis:'reported',precision:'Published glider location; positioning method unspecified',source:'gliders',source_url:GLIDERS_PAGE,evidence_url:GLIDERS_PAGE,attribution:'NOAA AOML CoastWatch and contributing glider operators',license:'NOAA freely redistributable data',license_url:'https://cwcgom.aoml.noaa.gov/erddap/info/GLIDERS_LAST_10_DAYS_LOCATIONS/index.html'});
 }return [...records.values()];
}
