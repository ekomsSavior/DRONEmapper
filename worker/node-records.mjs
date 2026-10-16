/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
import {rules as catalog} from './rid-catalog.mjs';
export const RETENTION=86400;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const number=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const protocols=new Set(['ble','ble-coded','wifi-beacon','wifi-aware','usb-wifi-beacon']);
const airframes=['Unknown','Aeroplane','Helicopter / multirotor','Gyroplane','Hybrid lift','Ornithopter','Glider','Kite','Free balloon','Captive balloon','Airship','Free-fall parachute','Rocket','Tethered powered aircraft','Ground obstacle','Other'];
export function envelope(body,observations=true){
 if(!body||Array.isArray(body)||typeof body!=='object'||body.schema_version!==1||!UUID.test(body.node_id)||Object.keys(body).sort().join(',')!==(observations?'node_id,observations,schema_version':'node_id,schema_version'))throw Error('Invalid envelope');
}
export function validateBatch(body,now){
 envelope(body);if(!Array.isArray(body.observations)||body.observations.length<1||body.observations.length>50)throw Error('Expected 1–50 observations');
 const seen=new Set();
 for(const r of body.observations){
  const candidate=r?.observation_type==='wifi-candidate';
  const required=['event_id','latitude','longitude','observed_at','received_at',...(candidate?['observation_type','candidate_id','signature','frequency_mhz','location_grid_degrees']:['rid','id_type','aircraft_type','protocol'])];
  const optional=candidate?{rssi_dbm:[-127,20]}:{rssi_dbm:[-127,20],altitude_m:[-999.5,31767.5],speed_mps:[0,254.25],heading:[0,359]};
  if(!r||typeof r!=='object'||Array.isArray(r)||required.some(k=>!(k in r))||Object.keys(r).some(k=>!required.includes(k)&&!(k in optional)))throw Error('Unexpected fields');
  if(typeof r.event_id!=='string'||!UUID.test(r.event_id)||seen.has(r.event_id))throw Error('Invalid event ID');seen.add(r.event_id);
  if(!number(r.latitude,-90,90)||!number(r.longitude,-180,180)||r.latitude===0&&r.longitude===0)throw Error('Invalid location');
  if(!number(r.observed_at,now-900,now+5)||!number(r.received_at,now-900,now+5)||!number(r.received_at-r.observed_at,-5,120))throw Error('Expired or future observation');
  if(candidate){
   if(!UUID.test(r.candidate_id)||!['wifi-cam-name','tello-name'].includes(r.signature)||r.location_grid_degrees!==0.01||!Number.isInteger(r.frequency_mhz)||!number(r.frequency_mhz,2400,5900))throw Error('Invalid candidate');
   for(const key of ['latitude','longitude'])if(Math.abs((r[key]-.005)*100-Math.round((r[key]-.005)*100))>0.0001)throw Error('Receiver area must be rounded to grid center');
  }else{
   if(typeof r.rid!=='string'||! /^[a-f0-9]{40}$/.test(r.rid)||/^0+$/.test(r.rid))throw Error('Invalid broadcast ID');
   if(!Number.isInteger(r.id_type)||r.id_type<1||r.id_type>4||!Number.isInteger(r.aircraft_type)||r.aircraft_type<0||r.aircraft_type>15||!protocols.has(r.protocol))throw Error('Invalid type or transport');
  }
  for(const [key,[lo,hi]] of Object.entries(optional))if(key in r&&!number(r[key],lo,hi))throw Error('Invalid '+key);
 }
 return body.observations;
}
export function identify(hex,type,rules=catalog){
 const unknown={manufacturer:null,model:null,identification:'unknown'};
 if(type!==1||typeof hex!=='string'||! /^[a-f0-9]{40}$/.test(hex))return unknown;
 const bytes=hex.match(/../g).map(x=>parseInt(x,16)),end=bytes.indexOf(0);
 if(end>=0&&bytes.slice(end).some(x=>x!==0))return unknown;
 const serial=String.fromCharCode(...(end<0?bytes:bytes.slice(0,end)));
 if(!/^[0-9A-HJ-NP-Z]{6,20}$/.test(serial)||parseInt(serial[4],16)!==serial.length-5)return unknown;
 const found=rules.filter(r=>r.start.length===serial.length&&r.end.length===serial.length&&serial>=r.start&&serial<=r.end);
 if(!found.length)return unknown;
 if(new Set(found.map(r=>[r.manufacturer,r.model,r.device_type].join('|'))).size!==1)return {...unknown,identification:'ambiguous-catalog-match'};
 const r=found[0];
 return r.device_type==='module'?{...unknown,identification:'broadcast-module-match',module_manufacturer:r.manufacturer,module_model:r.model}:{manufacturer:r.manufacturer,model:r.model,identification:'serial-range-match'};
}
export function nodeRecord(raw,id,uploaded){
 const common={id,origin:'community-node',latitude:raw.latitude,longitude:raw.longitude,observed_at:raw.observed_at,received_at:raw.received_at,uploaded_at:uploaded,operator:null,purpose:'unknown'};
 if(raw.observation_type==='wifi-candidate')return {...common,record_type:'signal',kind:'possible-drone',domain:'unknown',name:raw.signature==='tello-name'?'Possible drone · Tello-style Wi-Fi':'Possible drone / camera link',manufacturer:null,model:null,identification:'unconfirmed-wifi-name',position_basis:'receiver-area',position_method:'coarse-receiver-grid',precision:'Approximate receiver area; drone location unknown',status:'unconfirmed-signal',location_grid_degrees:.01,signature:raw.signature,protocol:'wifi-camera-candidate',frequency_mhz:raw.frequency_mhz,rssi_dbm:raw.rssi_dbm};
 const identity=identify(raw.rid,raw.id_type);
 const r={...common,record_type:'position',kind:'drone',domain:'air',name:identity.model||('Remote ID · '+id.slice(-8)),...identity,position_basis:'reported',position_method:'remote-id-broadcast',precision:'Aircraft broadcast position; unverified',status:'broadcast-reported',reported_airframe:airframes[raw.aircraft_type],protocol:raw.protocol};
 for(const key of ['altitude_m','speed_mps','heading','rssi_dbm'])if(key in raw)r[key]=raw[key];
 if('altitude_m' in raw)r.altitude_reference='WGS84 ellipsoid (broadcast)';
 return r;
}
export function mergeNodeRows(rows,now){
 const all=new Map();
 for(const row of rows){
  const r=JSON.parse(row.data);let t=all.get(r.id);
  if(!t){t={record:r,trail:[],nodes:new Set(),protocols:new Set(),count:0,first:r.observed_at,last:r.observed_at,received:r.received_at,uploaded:r.uploaded_at,online:false,conflict:false,history:new Map()};all.set(r.id,t);}
  if(r.record_type==='position'&&r.observed_at===t.last&&(r.latitude!==t.record.latitude||r.longitude!==t.record.longitude))t.conflict=true;
  if(r.observed_at>=t.last){t.record=r;t.last=r.observed_at;}
  t.first=Math.min(t.first,row.first_seen??r.observed_at);t.received=Math.max(t.received,r.received_at);t.uploaded=Math.max(t.uploaded,r.uploaded_at);
  for(const h of r.sighting_history||[]){const old=t.history.get(h.day);if(!old)t.history.set(h.day,{...h});else{old.observations+=h.observations;old.first_seen=Math.min(old.first_seen,h.first_seen);if(h.last_seen>=old.last_seen){old.last_seen=h.last_seen;old.latitude=h.latitude;old.longitude=h.longitude;}}}
  t.nodes.add(row.node);t.protocols.add(r.protocol);t.count+=row.observations??1;t.online ||= row.last_seen>=now-120;
  const p={latitude:r.latitude,longitude:r.longitude,observed_at:r.observed_at},prior=t.trail.at(-1);
  if(!prior||prior.observed_at!==p.observed_at||prior.latitude!==p.latitude||prior.longitude!==p.longitude)t.trail.push(p);
  if(t.trail.length>600)t.trail.shift();
 }
 return [...all.values()].map(t=>({...t.record,first_seen:t.first,last_seen:t.last,sighting_history:[...t.history.values()].sort((a,b)=>a.day.localeCompare(b.day)).slice(-365),received_at:t.received,uploaded_at:t.uploaded,reporting_nodes:t.nodes.size,observation_count:t.count,protocols:[...t.protocols].sort(),node_online:t.online,position_conflict:t.conflict,ghost:now-t.last>=14*86400,live:t.record.record_type==='position'&&!t.conflict&&now>=t.last&&now-t.last<=120,trail:t.conflict||t.record.record_type==='signal'?[]:t.trail}));
}
