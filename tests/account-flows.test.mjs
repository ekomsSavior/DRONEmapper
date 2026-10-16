import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID,createHmac} from 'node:crypto';
import {cleanAccounts} from '../worker/auth/maintenance.mjs';
import {authHarness} from './auth-harness.mjs';
const password='Nebula trains dance through midnight!';
function cookieJar(){const jar=new Map();return {headers:()=>[...jar].map(([k,v])=>k+'='+v).join('; '),take(r){for(const entry of r.headers.getSetCookie()){const [part]=entry.split(';'),i=part.indexOf('=');if(i>0)jar.set(part.slice(0,i),part.slice(i+1));}}};}
async function setup(t){
 const h=await authHarness();t.after(()=>h.mf.dispose());let ip='192.0.2.10',jar=cookieJar();
 h.request=async(path,body,options={})=>{
  const headers={'X-Test-IP':options.ip||ip,...(options.native?{}:{Origin:'http://localhost',Cookie:jar.headers()}),...options.headers};
  if(body)headers['Content-Type']='application/json';
  const response=await h.mf.dispatchFetch(path.startsWith('http:')?path:'http://localhost'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});
  if(!options.native)jar.take(response);return response;
 };
 h.fresh=()=>{ip='192.0.2.'+(+ip.split('.').pop()+1);};
 h.dropCookies=()=>{jar=cookieJar();};
 h.signup=async(email='owner@example.test')=>{
  const r=await h.request('/api/auth/sign-up/email',{email,password,name:'Owner'});assert.equal(r.status,200,await r.clone().text());return email;
 };
 h.verify=async()=>{
  const message=h.mail.at(-1);const url=message.text.match(/http:\/\/localhost\/api\/auth\/verify-email\?\S+/)[0];
  const r=await h.request(url,undefined,{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(r.status,302,await r.clone().text());
 };
 h.login=async(email='owner@example.test')=>h.request('/api/auth/sign-in/email',{email,password});
 return h;
}
test('one normalized email, four accounts per IP enforced in concurrent requests and DB',async t=>{
 const h=await setup(t);
 const responses=await Promise.all([1,2,3,4,5].map(i=>h.request('/api/auth/sign-up/email',{email:'user'+i+'@example.test',name:'User',password})));
 assert.equal(responses.filter(r=>r.ok).length,4);assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM user').first()).n,4);
 const rejected=responses.find(r=>!r.ok),message=await rejected.text();assert.doesNotMatch(message,/four|4 accounts|limit|IP address/i);
 const row=await h.db.prepare('SELECT * FROM user LIMIT 1').first();
 h.fresh();
 const duplicate=await h.request('/api/auth/sign-up/email',{email:row.email.toUpperCase(),password,name:'User'});assert.equal(duplicate.status,200);assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM user').first()).n,4);
 await assert.rejects(()=>h.db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,signupIpHash) VALUES(?,?,?,0,?,?,?)').bind(randomUUID(),'user','sixth@example.test',Date.now(),Date.now(),row.signupIpHash).run());
});
test('pairing requires verified browser session, private proof, owner scope; revocation rejects old poll',async t=>{
 const h=await setup(t),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url'),node_id=randomUUID();
 const start=await h.request('/account-api/device/start',{node_id,challenge,label:'Test phone'},{native:true});assert.equal(start.status,200);
 const pair=await start.json(),poll=()=>h.request('/account-api/device/poll',{device_id:pair.device_id,verifier},{native:true});
 assert.equal((await (await poll()).json()).status,'pending');
 assert.equal((await h.request('/account-api/device/approve',{code:pair.user_code})).status,401);
 await h.signup();await h.verify();assert.equal((await h.login()).status,200);
 assert.equal((await h.request('/account-api/device/approve',{code:pair.user_code})).status,200);
 const bad=await h.request('/account-api/device/poll',{device_id:pair.device_id,verifier:randomBytes(32).toString('base64url')},{native:true});assert.equal((await bad.json()).status,'expired');
 const credential=await (await poll()).json();assert.equal(credential.status,'connected');assert.equal((await (await poll()).json()).node_key,credential.node_key);
 const nodes=await (await h.request('/account-api/nodes')).json();assert.equal(nodes.nodes.length,1);assert.equal(JSON.stringify(nodes).includes(credential.node_key),false);
 const heartbeat=()=>h.mf.dispatchFetch('http://localhost/v1/nodes/heartbeat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential.node_key},body:JSON.stringify({schema_version:1,node_id})});
 assert.equal((await heartbeat()).status,200);
 h.dropCookies();h.fresh();await h.signup('other@example.test');await h.verify();assert.equal((await h.login('other@example.test')).status,200);
 await h.request('/account-api/nodes/revoke',{node_handle:credential.node_handle});
 assert.equal((await heartbeat()).status,200);assert.deepEqual((await (await h.request('/account-api/nodes')).json()).nodes,[]);
 h.dropCookies();h.fresh();await h.login();
 await h.request('/account-api/nodes/revoke',{node_handle:credential.node_handle});
 assert.equal((await heartbeat()).status,401);assert.equal((await (await poll()).json()).status,'expired');
});
function totp(secret){
 const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+=chars.indexOf(c).toString(2).padStart(5,'0');
 const key=Buffer.from((bits.match(/.{8}/g)||[]).map(s=>parseInt(s,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hash=createHmac('sha1',key).update(counter).digest(),offset=hash[19]&15;
 return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
test('authenticator enrollment, challenge, and one-use recovery codes',async t=>{
 const h=await setup(t);await h.signup();await h.verify();await h.login();
 const enabled=await h.request('/api/auth/two-factor/enable',{password,issuer:'DRONEmapper',method:'totp'});assert.equal(enabled.status,200,await enabled.clone().text());
 const {totpURI,backupCodes}=await enabled.json(),secret=new URL(totpURI).searchParams.get('secret');assert.equal(backupCodes.length,10);
 const checked=await h.request('/api/auth/two-factor/verify-totp',{code:totp(secret),trustDevice:false});assert.equal(checked.status,200,await checked.clone().text());
 h.dropCookies();h.fresh();
 const login=await h.login();assert.equal(login.status,200);assert.equal((await login.json()).twoFactorRedirect,true);
 assert.equal((await h.request('/account-api/nodes')).status,401);
 const recovery=await h.request('/api/auth/two-factor/verify-backup-code',{code:backupCodes[0],trustDevice:false});assert.equal(recovery.status,200,await recovery.clone().text());
 assert.equal((await h.request('/account-api/nodes')).status,200);
 h.dropCookies();h.fresh();await h.login();
 const replay=await h.request('/api/auth/two-factor/verify-backup-code',{code:backupCodes[0],trustDevice:false});assert.equal(replay.status,401,await replay.clone().text());
 assert.equal((await h.request('/account-api/nodes')).status,401);
});
test('password reset revokes existing sessions and token cannot be reused',async t=>{
 const h=await setup(t);await h.signup();await h.verify();await h.login();h.fresh();
 const request=await h.request('/api/auth/request-password-reset',{email:'owner@example.test',redirectTo:'http://localhost/account.html'});assert.equal(request.status,200,await request.clone().text());
 const link=h.mail.at(-1).text.match(/http:\/\/localhost\/api\/auth\/reset-password\/\S+/)[0];
 const redirect=await h.request(link,undefined,{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(redirect.status,302,await redirect.clone().text());
 const token=new URL(redirect.headers.get('location')).searchParams.get('token');assert.ok(token);
 const reset=await h.request('/api/auth/reset-password',{token,newPassword:'Different comet engines scatter sunlight!'});assert.equal(reset.status,200,await reset.clone().text());
 assert.equal((await h.request('/account-api/nodes')).status,401);
 const replay=await h.request('/api/auth/reset-password',{token,newPassword:'Other comet engines scatter sunlight!'});assert.equal(replay.ok,false);
});
test('cross-origin, malformed bodies and excess signup traffic fail before hashing',async t=>{
 const h=await setup(t),body={email:'blocked@example.test',password,name:'User'};
 assert.equal((await h.request('/api/auth/sign-up/email',body,{headers:{Origin:'https://evil.test'}})).status,403);
 const large=await h.request('/api/auth/sign-up/email',{...body,name:'x'.repeat(9000)});assert.equal(large.status,400);
 for(let i=0;i<5;i++)assert.equal((await h.request('/api/auth/sign-up/email',{...body,email:'bad'+i+'@example.test',password:'weak'})).status,400);
 const blocked=await h.request('/api/auth/sign-up/email',body);assert.equal(blocked.status,429);
 assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM user').first()).n,0);
});

test('optional aliases remain private until opt-in and anonymity removes public attribution',async t=>{
 const h=await setup(t);await h.signup();await h.verify();await h.login();
 const verifier=randomBytes(32).toString('base64url'),node_id=randomUUID();
 const pair=await (await h.request('/account-api/device/start',{node_id,label:'Test phone',challenge:createHash('sha256').update(verifier).digest('base64url')},{native:true})).json();
 await h.request('/account-api/device/approve',{code:pair.user_code});
 const credential=await (await h.request('/account-api/device/poll',{device_id:pair.device_id,verifier},{native:true})).json();
 const now=Date.now()/1000;
 const upload=await h.request('/v1/observations',{schema_version:1,node_id,observations:[{event_id:randomUUID(),observation_type:'wifi-candidate',candidate_id:randomUUID(),signature:'wifi-cam-name',frequency_mhz:2412,latitude:37.125,longitude:-122.125,location_grid_degrees:.01,observed_at:now,received_at:now}]},{native:true,headers:{Authorization:'Bearer '+credential.node_key}});
 assert.equal(upload.status,200,await upload.clone().text());
 const env=await h.mf.getBindings(),network=env.NODES.getByName('community');
 const names=async()=>{const snapshot=await network.snapshot(0);assert.equal(snapshot.signals.length,1);assert.doesNotMatch(JSON.stringify(snapshot),/owner@example.test/);return snapshot.signals[0].contributors;};
 assert.deepEqual(await names(),[]);
 assert.equal((await h.request('/account-api/profile',{name:'Night Owl',public_name:false})).status,200);assert.deepEqual(await names(),[]);
 assert.equal((await h.request('/account-api/profile',{name:'Night Owl',public_name:true})).status,200);assert.deepEqual(await names(),['Night Owl']);
 assert.equal((await h.request('/account-api/profile',{name:'',public_name:false})).status,200);assert.deepEqual(await names(),[]);
 const user=await h.db.prepare('SELECT name,publicName FROM user').first();assert.equal(user.name,'Anonymous');assert.equal(user.publicName,0);
 const session=await (await h.request('/api/auth/get-session')).json();assert.equal(session.user.name,'Anonymous');
 assert.equal((await h.request('/account-api/profile',{name:'<script>alert(1)</script>',public_name:true})).status,400);
});

test('abandoned registrations expire without deleting verified accounts or fresh attempts',async t=>{
 const h=await setup(t),now=Date.now(),ip='d'.repeat(64);
 const add=(id,verified,date)=>h.db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,signupIpHash) VALUES(?,?,?,?,?,?,?)').bind(id,'Anonymous',id+'@example.test',verified,date,date,ip).run();
 await add('abandoned',0,now-2*86400000);await add('old-iso',0,new Date(now-2*86400000).toISOString());await add('verified',1,now-2*86400000);await add('new',0,now);
 await cleanAccounts(h.db,now);
 const rows=await h.db.prepare('SELECT id FROM user ORDER BY id').all();assert.deepEqual(rows.results.map(r=>r.id),['new','verified']);
});
