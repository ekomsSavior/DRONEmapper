// Public AV Map documented driverless service areas; never vehicle positions.
export const AVMAP_URL='https://raw.githubusercontent.com/path-avmap/av-map-data/main/events.csv';
const UPDATES={geometry_updated:'geometry_file',vehicle_types_updated:'vehicles',platform_updated:'platform',fares_policy_changed:'fares',access_policy_changed:'access',supervision_updated:'supervision',fleet_partner_changed:'fleet_partner',direct_booking_updated:'direct_booking',service_model_updated:'service_model'};
const FIELDS=['date','event_type','company','city','geometry_file','vehicles','platform','fares','direct_booking','service_model','supervision','access','fleet_partner','expected_launch','company_link','booking_platform_link','source_url','notes'];
const GENERIC=new Set(['north america','south america','europe','asia','africa','global','worldwide','various','multiple locations']);
export function parseCSV(text){
 if(text.length>2000000)throw Error('Oversized AV Map CSV');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'){if(cell)throw Error('Malformed CSV quote');quoted=true;}else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Unclosed CSV quote');if(cell||row.length){row.push(cell);rows.push(row);}
 if(JSON.stringify(rows.shift())!==JSON.stringify(FIELDS))throw Error('Changed AV Map schema');
 if(rows.length>10000)throw Error('Too many AV Map rows');
 return rows.map(r=>{if(r.length!==FIELDS.length)throw Error('Malformed AV Map row');return Object.fromEntries(FIELDS.map((k,i)=>[k,r[i].trim()]));});
}
const eligible=s=>s.status==='service_created'&&s.supervision==='Autonomous'&&['Public','Waitlist'].includes(s.access)&&!GENERIC.has(s.city.toLowerCase());
export function replay(text,day,includeHistory=false){
 const states=new Map(),history=new Map();
 for(const row of parseCSV(text).sort((a,b)=>a.date.localeCompare(b.date))){
  const date=row.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>day||!row.company||!row.city)continue;
  const key=row.company+'|'+row.city,typ=row.event_type;
  if(['service_testing','service_announced','service_created'].includes(typ))states.set(key,{...(states.get(key)||{}),...Object.fromEntries(Object.entries(row).filter(([,v])=>v)),status:typ,last_event:date});
  else if(states.has(key)){
   const s=states.get(key);
   if(typ==='service_ended'){
    if(eligible(s)&&s.driverless_since){
     const key=row.company+'|'+row.city+'|'+s.driverless_since+'|'+date;
     history.set(key,{...s,status:'service_ended',ended_at:date,last_event:date,source_url:row.source_url||s.source_url});
    }
    s.status=typ;
   }
   else if(Object.hasOwn(UPDATES,typ)&&row[UPDATES[typ]])s[UPDATES[typ]]=row[UPDATES[typ]];
   else continue;
   s.last_event=date;
  }
  const state=states.get(key);
  if(state)state.driverless_since=eligible(state)?state.driverless_since||date:null;
 }
 return [...states.values()].filter(eligible).concat(includeHistory?[...history.values()]:[]);
}
export const geometryFiles=states=>[...new Set(states.map(s=>s.geometry_file).filter(v=>/^[a-zA-Z0-9_-]+\.geojson$/.test(v||'')))].sort();
export function position(value,geometries){
 if(/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value||'')){const [lon,lat]=value.split(',').map(Number);return lon>=-180&&lon<=180&&lat>=-90&&lat<=90&&(lon||lat)?[lon,lat,'Published city point; not a vehicle position']:null;}
 const obj=Object.hasOwn(geometries,value)?geometries[value]:null;if(!obj)return null;const points=[];
 function walk(g){
  if(!g||typeof g!=='object')return false;
  if(g.type==='FeatureCollection')return Array.isArray(g.features)&&g.features.length>0&&g.features.every(walk);
  if(g.type==='Feature')return walk(g.geometry);
  if(!['Polygon','MultiPolygon'].includes(g.type)||!Array.isArray(g.coordinates))return false;
  for(const poly of g.type==='MultiPolygon'?g.coordinates:[g.coordinates]){
   if(!Array.isArray(poly)||!poly.length)return false;
   for(const ring of poly){if(!Array.isArray(ring)||ring.length<4)return false;
    for(const p of ring){if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<-180||p[0]>180||p[1]<-90||p[1]>90)return false;points.push(p.slice(0,2));}
   }
  }return true;
 }
 if(!walk(obj)||!points.length)return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 if(xmax-xmin>10||ymax-ymin>10)return null;
 return [(xmin+xmax)/2,(ymin+ymax)/2,'Service-area bounding-box center; not a vehicle position'];
}
export function normalize(text,geometries,day){
 return replay(text,day,true).flatMap(s=>{const p=position(s.geometry_file||'',geometries);if(!p)return [];
 const ended=s.status==='service_ended',key=s.company+'|'+s.city+(ended?'|'+s.driverless_since+'|'+s.ended_at:'');
 const record={id:(ended?'avmap-history:':'avmap:')+encodeURIComponent(key),record_type:ended?'historical':'activity',kind:'autonomous-vehicle',domain:'ground',name:s.company+(ended?' — ended driverless service':' — driverless service'),model:null,manufacturer:null,operator:s.company,purpose:'unknown',latitude:p[1],longitude:p[0],place:s.city,status:ended?'historical-service':'documented-program',observed_at:null,record_dates:ended?s.driverless_since+' — '+s.ended_at:s.last_event,precision:p[2],source:'avmap',source_url:AVMAP_URL,evidence_url:'https://avmap.io/',attribution:'AV Map contributors / Jackson Lester',license:'MIT',license_url:'https://github.com/path-avmap/av-map-data/blob/main/LICENSE',verification:ended?'Previously documented driverless service; end recorded by AV Map':'Documented driverless service area; continued operation unverified'};
 if(ended){record.service_started=s.driverless_since;record.service_ended=s.ended_at;record.summary='AV Map records the end of this previously launched driverless service.';if(/^https:\/\//.test(s.source_url||''))record.evidence_url=s.source_url;}
 return [record];});
}

export async function fetchAVMap(fetchText,fetchJSON,now=Date.now()/1000){
 const day=new Date(now*1000).toISOString().slice(0,10),text=await fetchText(AVMAP_URL,2000000),files=geometryFiles(replay(text,day,true));
 if(files.length>50)throw Error('AV Map geometry limit');
 const geometries={};let next=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<files.length){const name=files[next++];geometries[name]=await fetchJSON('https://raw.githubusercontent.com/path-avmap/av-map-data/main/geometries/'+name,2000000);}}));
 return {records:normalize(text,geometries,day)};
}
