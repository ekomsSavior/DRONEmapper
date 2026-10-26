/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
// Shared by the browser preview and server. A CSV row is receiver evidence,
// never decoded aircraft telemetry. No OUI-only classifications are accepted.
export const WARD_MAX_BYTES=2*1024*1024, WARD_MAX_ROWS=15000, WARD_MAX_MATCHES=500;
export const WARD_MAX_AGE=365*86400;
const fail=message=>{throw Object.assign(Error(message),{status:422});};
export function csvRows(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>WARD_MAX_BYTES)fail('File exceeds 2 MiB. Split the export or use the folder uploader.');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 const endCell=()=>{row.push(cell);cell='';closed=false;if(row.length>40)fail('Too many CSV columns.');};
 const endRow=()=>{endCell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>WARD_MAX_ROWS+2)fail('Too many rows. Use the folder uploader.');};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c===',')endCell();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
  else if(c==='"'&&!cell&&!closed)quoted=true;
  else{if(closed||c==='"')fail('Malformed quoted CSV.');cell+=c;}
  if(cell.length>4096)fail('CSV field too long.');
 }
 if(quoted)fail('Unclosed CSV quotation.');if(cell||row.length||closed)endRow();return rows;
}
export function wardriveTime(value,zone){
 if(!/^(?:UTC|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(zone)||/^[+-]14:(?!00)/.test(zone))fail('Choose UTC or the export’s numeric UTC offset.');
 const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
 if(!m)return null;
 const [,y,mo,d,h,mi,s,ms,tz]=m,base=Date.UTC(+y,+mo-1,+d,+h,+mi,+s,+(ms||'').padEnd(3,'0'));
 const dt=new Date(base);
 if(dt.getUTCFullYear()!==+y||dt.getUTCMonth()!==+mo-1||dt.getUTCDate()!==+d||+h>23||+mi>59||+s>59)return null;
 const offset=tz||zone;if(offset==='UTC'||offset==='Z')return base/1000;
 if(!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)||/^[+-]14:(?!00)/.test(offset))return null;
 return base/1000-(offset[0]==='-'?-1:1)*(Number(offset.slice(1,3))*3600+Number(offset.slice(4))*60);
}
export function cameraSignature(name){
 if(/^WIFI_(?:[248]K|CAM|FPV)[_-]+[A-Z0-9_-]{3,32}$/i.test(name))return 'wifi-cam-name';
 if(/^TELLO-[A-Z0-9]{6}$/.test(name))return 'tello-name';return null;
}
const numeric=value=>value?.trim()!==''&&Number.isFinite(Number(value))?Number(value):NaN;
export function parseWardrive(text,zone='UTC',now=Date.now()/1000){
 wardriveTime('',zone);const rows=csvRows(text);
 if(rows[0]?.[0]?.startsWith('WigleWifi-'))rows.shift();
 const header=rows.shift()?.map(s=>s.trim().toLowerCase());
 const required=['mac','ssid','firstseen','rssi','currentlatitude','currentlongitude','type'];
 if(!header||new Set(header).size!==header.length||required.some(k=>!header.includes(k))||!header.includes('channel')&&!header.includes('frequency'))fail('Expected WiGLE CSV columns: MAC, SSID, FirstSeen, RSSI, CurrentLatitude, CurrentLongitude, Type and Channel or Frequency.');
 if(rows.length>WARD_MAX_ROWS)fail('Too many rows. Use the folder uploader.');
 const summary={rows:rows.length,candidates:0,unrelated:0,invalid:0,outside_time_window:0,duplicates:0},observations=[],seen=new Set();
 for(const row of rows){
  if(row.length!==header.length){summary.invalid++;continue;}
  const r=Object.fromEntries(header.map((key,i)=>[key,row[i]]));
  const signature=r.type.trim().toUpperCase()==='WIFI'?cameraSignature(r.ssid):null;
  if(!signature){summary.unrelated++;continue;}
  const mac=r.mac.trim().toUpperCase(),lat=numeric(r.currentlatitude),lon=numeric(r.currentlongitude),rssi=numeric(r.rssi);
  if(!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)||['00:00:00:00:00:00','FF:FF:FF:FF:FF:FF'].includes(mac)||(parseInt(mac.slice(0,2),16)&1)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>=90||Math.abs(lon)>=180||lat===0&&lon===0||!Number.isFinite(rssi)||rssi< -127||rssi>20){summary.invalid++;continue;}
  let frequency=numeric(r.frequency);const channel=numeric(r.channel);
  if(Number.isFinite(frequency)&&frequency>=1000000)frequency/=1000; // Kismet exports kHz.
  if(!Number.isFinite(frequency)&&Number.isInteger(channel))frequency=channel>=1&&channel<=13?2407+channel*5:channel===14?2484:channel>=32&&channel<=177?5000+channel*5:NaN;
  if(!Number.isInteger(frequency)||frequency<2400||frequency>5900){summary.invalid++;continue;}
  const stamp=wardriveTime(r.firstseen,zone);
  if(stamp===null){summary.invalid++;continue;}
  if(stamp<now-WARD_MAX_AGE||stamp>now+5){summary.outside_time_window++;continue;}
  // Keep receiver coordinates only at the center of a 0.01-degree grid cell.
  const latitude=Number((Math.floor(lat*100)/100+.005).toFixed(3)),longitude=Number((Math.floor(lon*100)/100+.005).toFixed(3));
  const identity=[mac,stamp,latitude,longitude,signature].join('|');
  if(seen.has(identity)){summary.duplicates++;continue;}seen.add(identity);
  observations.push({mac,identity,signature,frequency_mhz:frequency,rssi_dbm:rssi,latitude,longitude,observed_at:stamp});
  if(observations.length>WARD_MAX_MATCHES)fail('More than 500 matching observations. Use the folder uploader.');
 }
 summary.candidates=observations.length;return {summary,observations};
}
