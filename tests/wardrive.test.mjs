import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWardrive,csvRows,wardriveTime,WARD_MAX_BYTES} from '../worker/wardrive-parser.mjs';
import {authHarness} from './auth-harness.mjs';
const header='MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type';
const now=Date.now()/1000;
const date=stamp=>new Date(stamp*1000).toISOString().slice(0,19).replace('T',' ');
const row=(stamp=now-3600,ssid='WIFI_8K_a03817',mac='C0:18:82:17:38:A0')=>`${mac},${ssid},[OPEN],${date(stamp)},6,-52,37.12345,-122.12345,10,5,WIFI`;
const csv=(...rows)=>'WigleWifi-1.6,appRelease=test\r\n'+header+'\r\n'+rows.join('\r\n')+'\r\n';
test('CSV filtering keeps only supported evidence and coarsens coordinates',()=>{
 const {summary,observations}=parseWardrive(csv(row(),row(now-3600,'Home Router'),row(now-3600,'CoffeeShop'),row(now-3600,'WIFI_8K_other').replace(',WIFI',',BLE')),'UTC',now);
 assert.equal(summary.candidates,1);assert.equal(summary.unrelated,3);
 assert.equal(observations[0].latitude,37.125);assert.equal(observations[0].longitude,-122.125);
 assert.equal(observations[0].frequency_mhz,2437);assert.equal(observations[0].observed_at,Math.floor(now-3600));
 assert.equal('ssid' in observations[0],false);
 const noOui=parseWardrive(csv(row(now-3600,'Not a drone','60:60:1F:00:00:02')),'UTC',now);assert.equal(noOui.summary.candidates,0);
});
test('CSV quotes, BOM, dates, offsets and invalid bounds fail closed',()=>{
 assert.deepEqual(csvRows('\uFEFFa,b\r\n"x,""y""",z\r\n'),[['a','b'],['x,"y"','z']]);
 assert.throws(()=>csvRows('a,"bad'));assert.throws(()=>csvRows('"x"oops,y'));
 assert.equal(wardriveTime('2026-02-30 10:00:00','UTC'),null);
 assert.equal(wardriveTime('2026-10-19 10:00:00','-07:00'),Date.parse('2026-10-19T17:00:00Z')/1000);
 assert.equal(wardriveTime('2026-10-19T10:00:00+02:00','UTC'),Date.parse('2026-10-19T08:00:00Z')/1000);
 assert.throws(()=>wardriveTime('', '+14:10'));
 const parsed=parseWardrive(csv(row(now+600),row(now-366*86400),row().replace('37.12345',''),row().replace('-52','NaN'),row(now-100,'WIFI_8K_abc','FF:FF:FF:FF:FF:FF')),'UTC',now);
 assert.equal(parsed.summary.outside_time_window,2);assert.equal(parsed.summary.invalid,3);assert.equal(parsed.summary.candidates,0);
 assert.throws(()=>parseWardrive('x'.repeat(WARD_MAX_BYTES+1)));
 assert.throws(()=>parseWardrive(header+'\n'+Array.from({length:501},(_,i)=>row(now-100-i)).join('\n'),'UTC',now));
});
test('frequency columns and quoted names are parsed without false matches',()=>{
 const h=header.replace('Channel,','Channel,Frequency,');
 const r=row().replace(',6,-52,',',6,2437000,-52,');
 assert.equal(parseWardrive(h+'\n'+r,'UTC',now).observations[0].frequency_mhz,2437);
 const dup=parseWardrive(csv(row(),row()),'UTC',now);assert.equal(dup.summary.candidates,1);assert.equal(dup.summary.duplicates,1);
 assert.equal(parseWardrive(csv(row(now-1,'"Home, wifi"')),'UTC',now).summary.unrelated,1);
});

test('authenticated import is scoped, private, idempotent after prune, historical and revocable',async t=>{
 const h=await authHarness();t.after(()=>h.mf.dispose());
 const env=await h.mf.getBindings(),network=env.NODES.getByName('community');
 const token=await network.createWardriveToken('owner','Biscuit exports');
 const upload=(body,extra={},key=token.upload_token)=>h.mf.dispatchFetch('http://localhost/v1/wardrives',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'text/csv','X-Wardrive-Timezone':'UTC',...extra},body});
 const old=now-20*86400;
 const first=await upload(csv(row(old),row(old,'Home Router')));assert.equal(first.status,200,await first.clone().text());assert.equal((await first.json()).accepted,1);
 let snap=await network.snapshot(0);assert.equal(snap.signals.length,1);const signal=snap.signals[0];
 assert.equal(signal.ghost,true);assert.equal(signal.live,false);assert.equal(signal.node_online,false);assert.equal(snap.nodes.active_nodes,0);
 assert.equal(signal.source_type,'wardrive-import');assert.equal(signal.observed_at,Math.floor(old));assert.equal(signal.latitude,37.125);assert.deepEqual(signal.trail,[]);
 for(const privateValue of ['C0:18:82:17:38:A0','WIFI_8K_a03817','Home Router',token.upload_token,'37.12345','-122.12345'])assert.ok(!JSON.stringify(snap).includes(privateValue));
 // Old events are already pruned: receipts still prevent double counting.
 const replay=await upload(csv(row(old)));assert.equal((await replay.json()).duplicates,1);
 assert.equal((await network.snapshot(0)).signals[0].observation_count,1);
 assert.equal((await upload(csv(row(now-100)))).status,200);
 assert.equal((await upload(csv(row(old-86400)))).status,200);
 snap=await network.snapshot(0);assert.equal(snap.signals[0].observation_count,3);assert.equal(snap.signals[0].ghost,false);assert.equal(snap.signals[0].sighting_history.length,3);assert.equal(snap.signals[0].first_seen,Math.floor(old-86400));assert.equal(snap.signals[0].last_seen,Math.floor(now-100));
 const otherScope=await h.mf.dispatchFetch('http://localhost/v1/observations',{method:'POST',headers:{Authorization:'Bearer '+token.upload_token,'Content-Type':'application/json'},body:'{}'});assert.equal(otherScope.status,403);
 const status=await h.mf.dispatchFetch('http://localhost/v1/wardrives',{headers:{Authorization:'Bearer '+token.upload_token}});assert.equal(status.status,200);
 const listing=await network.accountNodes('owner');assert.equal(listing[0].scope,'wardrive');assert.equal(listing[0].online,false);assert.ok(!JSON.stringify(listing).includes(token.upload_token));
 await network.revokeAccountNode('someone-else',token.node_handle);assert.equal((await upload(csv(row(old)))).status,200);
 await network.revokeAccountNode('owner',token.node_handle);assert.equal((await upload(csv(row(old)))).status,401);assert.equal((await network.snapshot(0)).signals.length,0);
});
test('multipart, body bounds, rate reservation and browser origin checks',async t=>{
 const h=await authHarness();t.after(()=>h.mf.dispose());const env=await h.mf.getBindings(),network=env.NODES.getByName('community');
 const {upload_token}=await network.createWardriveToken('owner','Importer');
 const send=(body,headers={})=>h.mf.dispatchFetch('http://localhost/v1/wardrives',{method:'POST',headers:{Authorization:'Bearer '+upload_token,'X-Wardrive-Timezone':'UTC',...headers},body});
 assert.equal((await send(csv(row()),{'Content-Type':'text/csv',Origin:'https://evil.test'})).status,403);
 assert.equal((await send(csv(row()),{'Content-Type':'text/csv',Cookie:'session=foo'})).status,403);
 assert.equal((await send(csv(row()),{'Content-Type':'text/csv',Origin:'http://localhost'})).status,200);
 const form=new FormData();form.set('file',new File([csv(row())],'export.csv',{type:'text/csv'}));
 const wire=new Request('http://localhost',{method:'POST',body:form});
 const result=await send(new Uint8Array(await wire.arrayBuffer()),{'Content-Type':wire.headers.get('Content-Type')});assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).duplicates,1);
 assert.equal((await send('x'.repeat(WARD_MAX_BYTES+16385),{'Content-Type':'text/csv'})).status,413);
 assert.equal((await send('{}',{'Content-Type':'application/json'})).status,415);
 assert.equal((await send('broken',{'Content-Type':'text/csv'})).status,422);
 assert.equal((await send('broken',{'Content-Type':'text/csv'})).status,422);
 const limited=await send('broken',{'Content-Type':'text/csv'});assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
 assert.equal((await network.snapshot(0)).signals.length,1);
});

test('token issuance requires verified account, same origin and explicit consent',async t=>{
 const h=await authHarness();t.after(()=>h.mf.dispose());const jar=new Map();
 const request=async(path,body)=>{
  const r=await h.mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost','X-Test-IP':'192.0.2.75','Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],index=first.indexOf('=');jar.set(first.slice(0,index),first.slice(index+1));}return r;
 };
 assert.equal((await request('/account-api/wardrive/tokens',{label:'Biscuit',consent:true})).status,401);
 const signup=await request('/api/auth/sign-up/email',{email:'wardrive@example.test',password:'Comets drift through luminous skies!',name:'Tester'});assert.equal(signup.status,200);
 const link=h.mail.at(-1).text.match(/http:\/\/localhost\/api\/auth\/verify-email\?\S+/)[0];await request(link.replace('http://localhost',''));
 await request('/api/auth/sign-in/email',{email:'wardrive@example.test',password:'Comets drift through luminous skies!'});
 assert.equal((await request('/account-api/wardrive/tokens',{label:'Biscuit',consent:false})).status,400);
 const created=await request('/account-api/wardrive/tokens',{label:'Biscuit',consent:true});assert.equal(created.status,201,await created.clone().text());const token=await created.json();assert.match(token.upload_token,/^[a-f0-9]{64}$/);
 const list=await (await request('/account-api/nodes')).json();assert.equal(list.nodes[0].scope,'wardrive');assert.ok(!JSON.stringify(list).includes(token.upload_token));
 await request('/account-api/nodes/revoke',{node_handle:token.node_handle});assert.equal((await (await request('/account-api/nodes')).json()).nodes.length,0);
});

test('manual website uploads reuse one owned identity across visits and remain revocable',async t=>{
 const h=await authHarness();t.after(()=>h.mf.dispose());const env=await h.mf.getBindings(),network=env.NODES.getByName('community');
 const first=await network.importAccountWardrive('manual-owner',csv(row(now-20*86400)),'UTC');assert.equal(first.status,200);assert.equal(first.body.accepted,1);assert.equal('upload_token' in first.body,false);
 const second=await network.importAccountWardrive('manual-owner',csv(row(now-20*86400)),'UTC');assert.equal(second.body.duplicates,1);
 const nodes=await network.accountNodes('manual-owner');assert.equal(nodes.length,1);assert.equal(nodes[0].label,'Website log uploads');
 assert.equal((await network.snapshot(0)).signals[0].ghost,true);
 await network.revokeAccountNode('another-owner',nodes[0].handle);assert.equal((await network.snapshot(0)).signals.length,1);
 await network.revokeAccountNode('manual-owner',nodes[0].handle);assert.equal((await network.snapshot(0)).signals.length,0);
 const replacement=await network.importAccountWardrive('manual-owner',csv(row(now-100)),'UTC');assert.equal(replacement.body.accepted,1);assert.notEqual((await network.accountNodes('manual-owner'))[0].handle,nodes[0].handle);
});
test('manual file endpoint requires a verified session, same origin and explicit sharing consent',async t=>{
 const h=await authHarness();t.after(()=>h.mf.dispose());const jar=new Map();
 const request=async(path,body,headers={})=>{
  const raw=typeof body==='string';const r=await h.mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost','X-Test-IP':'192.0.2.83','Content-Type':raw?'text/csv':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...headers},body:body?(raw?body:JSON.stringify(body)):undefined,redirect:'manual'});
  for(const c of r.headers.getSetCookie()){const part=c.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}return r;
 };
 const path='/account-api/wardrive/import',headers={'X-Wardrive-Timezone':'UTC','X-Wardrive-Consent':'yes'};
 assert.equal((await request(path,csv(row()),headers)).status,401);
 await request('/api/auth/sign-up/email',{email:'manual@example.test',password:'Comets drift through luminous skies!',name:'Tester'});
 assert.equal((await request(path,csv(row()),headers)).status,401);
 const link=h.mail.at(-1).text.match(/http:\/\/localhost\/api\/auth\/verify-email\?\S+/)[0];await request(link.replace('http://localhost',''));
 await request('/api/auth/sign-in/email',{email:'manual@example.test',password:'Comets drift through luminous skies!'});
 assert.equal((await request(path,csv(row()),{...headers,Origin:'https://elsewhere.test'})).status,403);
 assert.equal((await request(path,csv(row()),{...headers,'X-Wardrive-Consent':'no'})).status,400);
 const r=await request(path,csv(row()),headers);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).accepted,1);
 assert.equal((await request(path,csv(row()),{...headers,'Content-Type':'application/json'})).status,415);
 assert.equal((await request(path,'x'.repeat(WARD_MAX_BYTES+16385),headers)).status,413);
});
