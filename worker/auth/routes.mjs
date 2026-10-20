
import {createAuth} from './config.mjs';
import {privateHash,clientIP,emailAddress,strongPassword,displayName,json,smallBody,GENERIC} from './security.mjs';
const AUTH_POST=new Set(['sign-up/email','sign-in/email','sign-out','send-verification-email','request-password-reset','reset-password','change-password','revoke-sessions','two-factor/enable','two-factor/disable','two-factor/verify-totp','two-factor/verify-backup-code','two-factor/generate-backup-codes','two-factor/get-totp-uri']);
const AUTH_GET=new Set(['get-session','verify-email']);
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export async function accountRequest(request,env){
 const url=new URL(request.url),local=env.AUTH_LOCAL_TEST==='true';
 if(!env.AUTH_DB||!env.ACCOUNTS||!env.AUTH_SECRET||env.AUTH_SECRET.length<32||env.AUTH_ENABLED!=='true')return json({error:'Account connection is temporarily unavailable.'},503);
 if(url.origin!==env.AUTH_ORIGIN||(!local&&url.protocol!=='https:'))return json({error:'Use the DRONEmapper website.'},403);
 const ip=clientIP(request,local);if(!ip)return json({error:GENERIC},403);
 if(env.AUTH_EDGE && !(await env.AUTH_EDGE.limit({key:ip})).success)return json({error:GENERIC},429);
 const origin=request.headers.get('Origin');
 const isAuth=url.pathname.startsWith('/api/auth/'),path=url.pathname.slice(isAuth?10:13);
 // Email links are top-level cross-site navigations protected by their one-use token.
 // All browser mutations and session reads still require the same origin.
 const emailLink=isAuth&&request.method==='GET'&&(path==='verify-email'||/^reset-password\/[A-Za-z0-9_-]{16,200}$/.test(path));
 if(!emailLink&&(origin&&origin!==env.AUTH_ORIGIN||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:GENERIC},403);
 if(isAuth&&!(request.method==='POST'?AUTH_POST:request.method==='GET'?AUTH_GET:new Set()).has(path)&&!(request.method==='GET'&&/^reset-password\/[A-Za-z0-9_-]{16,200}$/.test(path)))return json({error:'Not found'},404);
 if(!isAuth&&!['POST','GET'].includes(request.method))return json({error:'Not found'},404);
 // Browser mutations require same-origin JSON. Native device start/poll send no cookies.
 const native=!isAuth&&['device/start','device/poll'].includes(path);
 if(request.method==='POST'&&!native&&origin!==env.AUTH_ORIGIN)return json({error:GENERIC},403);
 if(native&&request.headers.has('Cookie'))return json({error:GENERIC},403);
 const ipHash=privateHash(env.AUTH_SECRET,'ip',ip),guard=env.ACCOUNTS.getByName('accounts');
 let body={};
 try{if(request.method==='POST')body=await smallBody(request);}catch{return json({error:'Unable to read that request.'},400);}
 const email=emailAddress(body.email);if(body.email!==undefined)body.email=email;
 const kind=isAuth?(path==='sign-up/email'?'signup':path==='sign-in/email'?'login':['send-verification-email','request-password-reset'].includes(path)?'mail':'auth'):path==='device/start'?'start':path==='device/poll'?'poll':'auth';
 if(!await guard.permit(ipHash,kind,email?privateHash(env.AUTH_SECRET,'email',email):null))return json({error:GENERIC},429);
 if(isAuth){
  if(['sign-up/email','reset-password','change-password'].includes(path)&&!strongPassword(body.newPassword??body.password))return json({error:'Choose a stronger password of 15–128 characters. A long, unique passphrase works well.'},400);
  if(path==='sign-up/email'){
   // The database trigger below enforces the cap atomically, including concurrent signups.
   const count=await env.AUTH_DB.prepare('SELECT COUNT(*) n FROM user WHERE signupIpHash=?').bind(ipHash).first();
   if(count.n>=4)return json({error:GENERIC},429);
   body.name=displayName(body.name);if(!body.name)return json({error:'Use up to 32 letters, numbers, spaces, dots, underscores or dashes for your display name.'},400);
   delete body.publicName;delete body.image;delete body.signupIpHash;
   body.callbackURL=env.AUTH_ORIGIN+'/account.html';
  }
  if(['request-password-reset','send-verification-email'].includes(path)){
   body.callbackURL=env.AUTH_ORIGIN+'/account.html';
   body.redirectTo=env.AUTH_ORIGIN+'/account.html';
  }
  const auth=createAuth(env,ipHash);
  const cleanHeaders=new Headers(request.headers);cleanHeaders.delete('Content-Length');cleanHeaders.set('CF-Connecting-IP',ip);
  const clean=new Request(request.url,{method:request.method,headers:cleanHeaders,...(request.method==='POST'?{body:JSON.stringify(body)}:{})});
  let result;try{result=await auth.handler(clean);}catch{return json({error:GENERIC},503);}
  const headers=new Headers(result.headers);headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
  if(result.status===429||result.status>=500)return json({error:GENERIC},result.status);
  if(path==='sign-up/email'&&!result.ok)return json({error:'Unable to create that account. Try signing in or resetting your password.'},400);
  return new Response(result.body,{status:result.status,headers});
 }
 if(path==='device/start'&&request.method==='POST'){
  if(!UUID.test(body.node_id)||!/^[-_A-Za-z0-9]{43}$/.test(body.challenge)||typeof body.label!=='string'||body.label.length<1||body.label.length>80)return json({error:'Invalid connection request'},400);
  const pair=await guard.start(body.node_id,body.challenge,body.label.replace(/[\x00-\x1f]/g,''));
  return json({...pair,verification_url:env.AUTH_ORIGIN+'/account.html?device='+pair.user_code});
 }
 if(path==='device/poll'&&request.method==='POST'){
  if(!UUID.test(body.device_id)||!/^[-_A-Za-z0-9]{43}$/.test(body.verifier))return json({error:'Invalid connection request'},400);
  return json(await guard.poll(body.device_id,body.verifier));
 }
 const session=await createAuth(env).api.getSession({headers:request.headers});
 if(!session?.user?.emailVerified)return json({error:'Sign in with your verified email first.'},401);
 const owner=session.user.id;
 if(path==='wardrive/tokens'&&request.method==='POST'){
  if(body.consent!==true||typeof body.label!=='string'||!body.label.trim()||body.label.length>80||/[\x00-\x1f]/.test(body.label))return json({error:'Name the uploader and confirm that you want to contribute matching signal areas.'},400);
  try{return json(await env.NODES.getByName('community').createWardriveToken(owner,body.label.trim()),201);}
  catch{return json({error:'Unable to create another upload token. Remove an unused node and try again.'},409);}
 }
 if(path==='profile'&&request.method==='POST'){
  const name=displayName(body.name);
  if(!name||typeof body.public_name!=='boolean')return json({error:'Use up to 32 letters, numbers, spaces, dots, underscores or dashes for your display name.'},400);
  const publish=body.public_name&&name!=='Anonymous';
  await env.NODES.getByName('community').setAccountProfile(owner,publish?name:'');
  await env.AUTH_DB.prepare('UPDATE user SET name=?,publicName=?,updatedAt=? WHERE id=?').bind(name,publish?1:0,Date.now(),owner).run();
  return json({name,public_name:publish});
 }
 if(path==='nodes'&&request.method==='GET')return json({nodes:await env.NODES.getByName('community').accountNodes(owner)});
 if(path==='nodes/revoke'&&request.method==='POST'){
  if(!UUID.test(body.node_handle))return json({error:'Invalid node'},400);
  await env.NODES.getByName('community').revokeAccountNode(owner,body.node_handle);return json({ok:true});
 }
 if(path==='device/details'&&request.method==='POST'){
  const code=String(body.code||'').replace('-','').toUpperCase();if(!/^[A-F0-9]{10}$/.test(code))return json({error:'Check the code shown in your app.'},400);
  const details=await guard.details(code);return details?json(details):json({error:'This connection has expired. Start again in the app.'},404);
 }
 if(path==='device/approve'&&request.method==='POST'){
  const code=String(body.code||'').replace('-','').toUpperCase();
  if(!/^[A-F0-9]{10}$/.test(code)||!await guard.approve(code,owner))return json({error:'This connection has expired or was already approved.'},409);
  return json({ok:true});
 }
 return json({error:'Not found'},404);
}
