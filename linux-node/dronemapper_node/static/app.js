import {contactPoint} from './radar.js';
const $ = id => document.getElementById(id);
let state, csrf = '', mode = 'signals', selected = '', initialized = false, busy = false, lastConnected;
try {
  const savedRange=localStorage.getItem('dronemapper.radar.range');
  if ([...$('range').options].some(option=>option.value===savedRange)) $('range').value=savedRange;
} catch {}
const make = (tag, text, className) => { const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e; };
function notice(text) { $('notice').textContent = text; }
async function post(path, body = {}) {
  const response = await fetch('/api/' + path, {method:'POST', headers:{'Content-Type':'application/json','X-Node-CSRF':csrf}, body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function settingsToForm(settings) {
  $('label').value = settings.label;
  $('wifi').value = settings.wifi_interfaces.join(', ');
  const lan=settings.lan_interface || '';
  if (lan && ![...$('lan-interface').options].some(x=>x.value===lan)) $('lan-interface').append(new Option(lan,lan));
  $('lan-interface').value=lan;
  if (settings.ble_adapter && ![...$('ble').options].some(x => x.value === settings.ble_adapter)) {
    const option = make('option', settings.ble_adapter); option.value = settings.ble_adapter; $('ble').append(option);
  }
  $('ble').value = settings.ble_adapter;
  $('sdr').value = settings.sdr;
  $('band').value = settings.sdr_band;
  $('sdr-mode').value = settings.sdr_mode;
  $('dji-frequency').value = String(settings.dji_frequency);
  $('readsb-file').value = settings.readsb_file;
  $('mqtt').value = settings.mqtt_file;
  if (settings.serial_port && ![...$('serial-port').options].some(x=>x.value===settings.serial_port)) $('serial-port').append(new Option(settings.serial_port,settings.serial_port));
  $('serial-port').value=settings.serial_port || '';
  $('serial-format').value=settings.serial_format || 'marauder';
  $('serial-baud').value=String(settings.serial_baud || 115200);
  $('latitude').value = settings.station?.[0] ?? '';
  $('longitude').value = settings.station?.[1] ?? '';
  $('share-rid').checked = settings.share_rid;
  $('share-areas').checked = settings.share_areas;
  $('share-robots').checked = settings.share_robots;
  $('share-decoded').checked = settings.share_decoded;
  sdrChoices();
}
function sdrChoices() {
  $('band').disabled=$('sdr-mode').value!=='spectrum';
  $('dji-frequency').disabled=$('sdr-mode').value!=='dji';
  for (const option of $('band').options) option.disabled=$('sdr').value==='rtl' && ['2400','5800','5900'].includes(option.value);
  if ($('band').selectedOptions[0]?.disabled) $('band').value='915';
}
function formSettings() {
  const lat = $('latitude').value, lon = $('longitude').value;
  if ((lat === '') !== (lon === '')) throw new Error('Enter both latitude and longitude, or leave both blank.');
  return {label:$('label').value.trim(),wifi_interfaces:$('wifi').value.split(',').map(x=>x.trim()).filter(Boolean),
    lan_interface:$('lan-interface').value,
    ble_adapter:$('ble').value,sdr:$('sdr').value,sdr_band:$('band').value,sdr_mode:$('sdr-mode').value,dji_frequency:Number($('dji-frequency').value),readsb_file:$('readsb-file').value.trim(),mqtt_file:$('mqtt').value.trim(),
    serial_port:$('serial-port').value,serial_baud:Number($('serial-baud').value),serial_format:$('serial-format').value,
    station:lat === '' ? null : [Number(lat),Number(lon)],share_rid:$('share-rid').checked,share_areas:$('share-areas').checked,share_robots:$('share-robots').checked,share_decoded:$('share-decoded').checked};
}
async function capabilities() {
  try {
    const r = await fetch('/api/doctor'); if (!r.ok) throw new Error('Could not check receivers');
    const data = await r.json();
    const lanCurrent=$('lan-interface').value;
    $('lan-interface').replaceChildren(new Option('Off',''));
    for (const name of data.lan_interfaces || []) $('lan-interface').append(new Option(name,name));
    if (lanCurrent && !(data.lan_interfaces||[]).includes(lanCurrent)) $('lan-interface').append(new Option(lanCurrent+' · not attached',lanCurrent));
    $('lan-interface').value=lanCurrent;
    const serialCurrent=$('serial-port').value;
    $('serial-port').replaceChildren(new Option('Off',''));
    for (const port of data.serial_ports || []) $('serial-port').append(new Option(port.port+(port.usb_id?' · '+port.usb_id:''),port.port));
    if(serialCurrent && !(data.serial_ports||[]).some(p=>p.port===serialCurrent)) $('serial-port').append(new Option(serialCurrent+' · not attached',serialCurrent));
    $('serial-port').value=serialCurrent;
    const current = $('ble').value;
    $('ble').replaceChildren(new Option('Off',''));
    for (const name of data.bluetooth) $('ble').append(new Option(name==='default'?'System Bluetooth':name,name));
    if (current && !data.bluetooth.includes(current)) $('ble').append(new Option(current+' · not attached',current));
    $('ble').value = current;
    const box = $('capabilities'); box.replaceChildren();
    box.append(make('p',data.wifi.length ? data.wifi.map(x=>`${x.name}: ${x.mode}${x.channel ? ' · channel '+x.channel : ''}`).join(' / ') : 'No capture interfaces found.'));
    box.append(make('p',`Bluetooth: ${data.bluetooth.join(', ') || 'not found'} · Bleak: ${data.bleak ? 'installed' : 'not installed'}`));
    box.append(make('p',Object.entries(data.tools).map(([k,v])=>`${k}: ${v?'available':data.tool_access?.[k]?'installed; access unavailable':'not installed'}`).join(' · ')));
    box.append(make('p','USB serial: '+(data.pyserial?'driver installed':'install the serial extra')+' · '+(data.serial_ports?.length || 0)+' ports'));
    box.append(make('p','DJI decoder dependencies: '+(data.dji_decoder?'installed':'install the DJI extra')));
    box.append(make('p','Capabilities are not a reception test. Run “dronemapper-node wifi-help” for monitor setup.'));
  } catch (e) { notice(e.message); }
}
function detail(contact) {
  const panel = $('selected');
  if (!contact) { panel.textContent='Select a glowing dot or a detection to see details.'; return; }
  panel.replaceChildren(make('h3',contact.name));
  const lines = [contact.display_id ? 'Broadcast ID: '+contact.display_id : '', contact.mac ? 'Radio MAC: '+contact.mac : contact.receiver_id ? 'Local Bluetooth UUID: '+contact.receiver_id : '', contact.device_id ? 'Device ID: '+contact.device_id : '',
    contact.radio_vendor ? 'Radio vendor: '+contact.radio_vendor : '', contact.callsign ? 'Callsign: '+contact.callsign : '', contact.local_only ? 'Local receiver observation · not uploaded' : '', contact.manufacturer ? 'Manufacturer / model: '+contact.manufacturer+' / '+(contact.model||'Unknown model') : '',
    contact.module ? 'Broadcast module: '+contact.module : '',contact.identification || '',
    contact.ssid ? (contact.kind==='hardware-vendor'?'Network name: ':'Camera-link name: ')+contact.ssid+' · unconfirmed device' : '',
    'Input: '+contact.source+(contact.protocol ? ' · '+contact.protocol : ''),
    Number.isFinite(contact.rssi_dbm) ? 'Signal: '+contact.rssi_dbm+' dBm' : '',
    Number.isFinite(contact.rssi_dbfs) ? 'Decoder signal: '+contact.rssi_dbfs+' dBFS (not dBm)' : '',
    contact.channel ? 'Receiver channel: '+contact.channel : '',
    contact.transports ? 'Reported transports: '+contact.transports : '',
    Number.isFinite(contact.packet_count) ? 'Receiver packets: '+contact.packet_count : '',
    Number.isFinite(contact.reported_latitude) ? 'Receiver coordinates: '+contact.reported_latitude.toFixed(6)+', '+contact.reported_longitude.toFixed(6)+' · fix age unknown' : '',
    contact.frequency_mhz ? 'Frequency: '+contact.frequency_mhz+' MHz' : '',
    Number.isFinite(contact.distance_m) ? `Reported GPS: ${Math.round(contact.distance_m)} m · ${Math.round(contact.bearing)}° true bearing` : 'Direction and distance unknown',
    Number.isFinite(contact.altitude_m) ? 'Broadcast altitude: '+contact.altitude_m+' m · '+(contact.altitude_reference||'WGS84') : '',
    Number.isFinite(contact.speed_mps) ? 'Broadcast speed: '+contact.speed_mps+' m/s' : '',
    'Received: '+new Date(contact.seen*1000).toLocaleString()];
  for (const line of lines.filter(Boolean)) panel.append(make('p',line));
  if (contact.vendor_url) panel.append(referenceLink('Manufacturer ↗',contact.vendor_url));
}
function referenceLink(label,url) {
  const link=make('a',label); if (/^https:\/\//.test(url)) link.href=url;
  link.target='_blank';link.rel='noreferrer';return link;
}
function networkDevices() {
  const list=$('network-devices');list.replaceChildren();
  const devices=state.network_devices || [];
  $('network-count').textContent=`${devices.length} · ${(state.network_frames||0).toLocaleString()} ARP frames`;
  for (const device of devices) {
    const item=make('article','','contact');
    item.append(make('strong',device.name),make('p',`${device.mac} · ${device.protocol} · ${device.source}`),
      make('p',device.identification),make('p','Heard '+new Date(device.seen*1000).toLocaleString()+' · local only'),
      referenceLink('Manufacturer ↗',device.vendor_url));list.append(item);
  }
  if (!devices.length) list.append(make('p',state.settings.lan_interface?'No matching LAN sender in the last two minutes.':'Choose a LAN interface in Radio settings to listen.'));
  const refs=$('device-references');
  if (!refs.childElementCount && state.device_references) {
    refs.append(make('p','Hardware facts for identification; these are not received detections.'));
    for (const model of state.device_references.models) {
      const item=make('article','','contact');
      item.append(make('strong',model.name),make('p',model.category+' · '+model.connection),
        make('p',model.description),referenceLink('Model details ↗',model.url));
      const vendor=state.device_references.vendors.find(v=>v.id===model.vendor);
      if (vendor) item.append(make('span',' · '),referenceLink('Manufacturer ↗',vendor.url));
      refs.append(item);
    }
  }
}
function radar() {
  const svg = $('dots'); svg.replaceChildren();
  const ns='http://www.w3.org/2000/svg'; let count=0;
  for (const contact of state.contacts) {
    const p = contactPoint(contact,mode,Number($('range').value)); if (!p) continue;
    count++;
    const group = document.createElementNS(ns,'g');
    const color = ['possible-drone','possible-robot'].includes(contact.kind)?' possible':contact.kind==='drone'?'':' unknown';
    const halo = document.createElementNS(ns,'circle');
    halo.setAttribute('cx',p.x); halo.setAttribute('cy',p.y); halo.setAttribute('r','12'); halo.setAttribute('class','dot halo'+color);
    const dot = document.createElementNS(ns,'circle');
    dot.setAttribute('cx',p.x); dot.setAttribute('cy',p.y); dot.setAttribute('r',contact.key===selected?'7':'5'); dot.setAttribute('class','dot'+color);
    dot.setAttribute('tabindex','0'); dot.setAttribute('role','button');
    dot.setAttribute('aria-label',contact.name+(p.outside?' · beyond displayed range':''));
    const title=document.createElementNS(ns,'title'); title.textContent=contact.name+(p.outside?' · beyond displayed range':'');dot.append(title);
    const choose=()=>{selected=contact.key;detail(contact);radar();};
    dot.addEventListener('click',choose); dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
    group.append(halo,dot);svg.append(group);
  }
  $('empty-radar').textContent = count ? '' : mode==='signals' ? 'Waiting for a matching signal' : state.settings.station ? 'No fresh reported positions' : 'Set a station location for positions';
  $('compass').hidden = mode!=='positions'; $('compass').setAttribute('visibility',mode==='positions'?'visible':'hidden');
  $('range-control').hidden = mode!=='positions';
  $('radar-caption').textContent = mode==='signals' ? 'Signal strength view · direction and distance unknown. Dot angles are for layout only.' : 'North up · aircraft-reported GPS relative to your station. Dots at the rim may be beyond the selected range.';
  detail(state.contacts.find(x=>x.key===selected));
}
function spectrum() {
  const bins=state.spectrum; $('spectrum-empty').textContent=bins.length?'':state.settings.sdr==='off'?'Choose an SDR in Radio settings':state.settings.sdr_mode!=='spectrum'?'Protocol decoding selected · spectrum is off':'Waiting for real spectrum measurements';
  if (!bins.length) {$('spectrum-line').setAttribute('d','');$('spectrum-info').textContent='Power and frequency are not device identity. Spectrum measurements stay on this computer.';return;}
  const lo=bins[0].frequency_mhz, hi=bins.at(-1).frequency_mhz;
  const low=Math.min(...bins.map(x=>x.power_db))-5, high=Math.max(...bins.map(x=>x.power_db))+5;
  const path=bins.map((b,i)=>`${i?'L':'M'}${20+(b.frequency_mhz-lo)/Math.max(.001,hi-lo)*760},${155-(b.power_db-low)/(high-low)*130}`).join(' ');
  $('spectrum-line').setAttribute('d',path);
  const peak=bins.reduce((a,b)=>a.power_db>b.power_db?a:b);
  $('spectrum-info').textContent=`${lo.toFixed(1)}–${hi.toFixed(1)} MHz · strongest bin ${peak.frequency_mhz.toFixed(2)} MHz / ${peak.power_db.toFixed(1)} dB (${peak.above_median_db.toFixed(1)} dB above median). Unclassified RF activity; stays local.`;
}
function render() {
  if (lastConnected !== state.connected) {
    $('share-rid').checked=state.settings.share_rid;
    $('share-areas').checked=state.settings.share_areas;
    $('share-robots').checked=state.settings.share_robots;
    $('share-decoded').checked=state.settings.share_decoded;
    lastConnected=state.connected;
  }
  if (!initialized) {settingsToForm(state.settings);initialized=true;}
  $('contact-count').textContent=state.contacts.length;
  $('frame-count').textContent=state.wifi_frames.toLocaleString();
  $('rid-count').textContent=state.rid_messages.toLocaleString();
  $('decoded-count').textContent=(state.decoded_messages||0).toLocaleString();
  $('queued-count').textContent=state.counts.queued||0;
  $('toggle').textContent=state.running?'Stop listening':'Start listening';
  $('scan-state').textContent=state.running?'Listening requested':'Stopped';
  $('version').textContent='v'+state.version;
  $('account-state').textContent=state.connected?'Connected · '+state.display_name:'Not connected';
  $('connect').hidden=state.connected;
  $('disconnect').hidden=!state.connected;
  $('upload-state').textContent=state.account_status||state.upload_status;
  $('pair-box').hidden=!state.pair;
  if (state.pair) {$('pair-code').textContent=state.pair.user_code;$('pair-link').href=state.pair.verification_url;}
  const list=$('contacts');list.replaceChildren();
  for (const contact of state.contacts) {
    const button=make('button','','contact');
    button.append(make('strong',contact.name),make('span',(contact.mac||contact.display_id||contact.device_id||contact.receiver_id||'Unknown ID')+' · '+(contact.protocol||'Wi-Fi candidate')),
      make('span',`${Number.isFinite(contact.rssi_dbm)?contact.rssi_dbm+' dBm':Number.isFinite(contact.rssi_dbfs)?contact.rssi_dbfs+' dBFS':'Signal unknown'} · ${Math.max(0,Math.round(Date.now()/1000-contact.seen))}s ago · ${contact.source}`));
    button.onclick=()=>{selected=contact.key;radar();};list.append(button);
  }
  if (!state.contacts.length) list.append(make('p','No matching broadcasts in the last two minutes. A quiet screen does not prove the area is clear.','empty'));
  const statuses=$('radio-status');statuses.replaceChildren();
  for (const [name,text] of Object.entries(state.radios)) {const p=make('p','');p.append(make('strong',name+' · '),document.createTextNode(text));statuses.append(p);}
  if (!Object.keys(state.radios).length) statuses.append(make('p','Choose receivers, save, then start listening.'));
  radar();spectrum();networkDevices();
}
async function refresh() {
  try {const response=await fetch('/api/status');if(!response.ok)throw new Error('Local node unavailable');state=await response.json();csrf=state.csrf;render();}
  catch(e){notice('Local node connection lost. Check that the desktop node is running.');}
}
async function action(fn) {
  if (busy) return;busy=true;
  try {await fn();await refresh();} catch(e){notice(e.message);} finally{busy=false;}
}
$('toggle').onclick=()=>action(async()=>{await post(state.running?'stop':'start');notice('');});
$('connect').onclick=()=>action(async()=>{await post('pair');notice('Approve the code in your DRONEmapper account, then choose what to share.');});
$('disconnect').onclick=()=>action(async()=>{await post('disconnect');initialized=false;notice('Local pairing removed. Use Manage account to revoke server access and remove reports.');});
$('settings').onsubmit=e=>{e.preventDefault();action(async()=>{await post('settings',formSettings());notice('Settings saved. Sharing choices apply immediately; radio changes apply when listening starts.');});};
$('serial-refresh').onclick=()=>capabilities();
$('serial-connect').onclick=()=>action(async()=>{
  if(!$('serial-port').value)throw new Error('Choose an attached serial receiver first.');
  await post('serial',{serial_port:$('serial-port').value,serial_baud:Number($('serial-baud').value),serial_format:$('serial-format').value});
  notice('Serial connection requested. Start Remote ID Scan on the board; check Receiver status below.');
});
$('serial-disconnect').onclick=()=>action(async()=>{await post('serial',{serial_port:''});$('serial-port').value='';notice('Serial receiver disconnected.');});
$('refresh').onclick=e=>{e.preventDefault();capabilities();};
for(const name of ['signals','positions'])$(name).onclick=()=>{mode=name;$('signals').setAttribute('aria-pressed',name==='signals');$('positions').setAttribute('aria-pressed',name==='positions');if(state)radar();};
$('range').onchange=()=>{
  try {localStorage.setItem('dronemapper.radar.range',$('range').value);} catch {}
  if(state)radar();
};
$('sdr').onchange=sdrChoices;
$('sdr-mode').onchange=sdrChoices;
$('dji-report').onchange=async()=>{
  const box=$('dji-review');box.replaceChildren();
  try {
    const file=$('dji-report').files[0]; if(!file)return;
    if(file.size>1048576)throw new Error('Review file is too large');
    const report=JSON.parse(await file.text());
    if(report.schema_version!==1||report.mode!=='recorded-review'||report.protocol!=='dji-droneid'||!Array.isArray(report.detections)||report.detections.length>1000)throw new Error('Choose a DRONEmapper DJI review JSON file');
    box.append(make('p',`${report.decoded_packets} CRC-valid packets · ${report.rejected_candidates} rejected candidates · recorded data`));
    for(const row of report.detections){
      const item=make('div','','selection'); item.append(make('strong',String(row.name||'DJI DroneID').slice(0,100)),make('p','Broadcast ID: '+String(row.device_id||'Unknown').slice(0,40)));
      if(Number.isFinite(row.observed_at))item.append(make('p','Broadcast time: '+new Date(row.observed_at*1000).toLocaleString()));
      item.append(make('p',Number.isFinite(row.latitude)&&Number.isFinite(row.longitude)?`Aircraft-reported position: ${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}`:'No usable aircraft position'));
      box.append(item);
    }
    if(!report.detections.length)box.append(make('p','No valid DJI packets decoded from this recording.'));
  }catch(error){box.append(make('p',error.message));}
};
await capabilities();await refresh();
setInterval(()=>{if(!busy)refresh();},2000);
