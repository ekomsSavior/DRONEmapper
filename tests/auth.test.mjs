import test from 'node:test';
import assert from 'node:assert/strict';
import {authHarness} from './auth-harness.mjs';
import {strongPassword,hashPassword,verifyPassword} from '../worker/auth/security.mjs';
test('password requirements and salted scrypt verification',async()=>{
 for(const p of ['short','passwordpassword','aaaaaaaaaaaaaaaa','12345678901234567890'])assert.equal(strongPassword(p),false,p);
 assert.equal(strongPassword('Four unusual otters juggle!'),true);
 const a=await hashPassword('Four unusual otters juggle!'),b=await hashPassword('Four unusual otters juggle!');assert.notEqual(a,b);
 assert.equal(await verifyPassword({hash:a,password:'Four unusual otters juggle!'}),true);
 assert.equal(await verifyPassword({hash:a,password:'Four wrong otters juggle!'}),false);
});
test('email verification gates scanner access',async()=>{
 const {mf,db,mail}=await authHarness();
 try{
 const post=(path,body,headers={})=>mf.dispatchFetch('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost','X-Test-IP':'192.0.2.1',...headers},body:JSON.stringify(body)});
 const result=await post('/api/auth/sign-up/email',{email:'Tester@EXAMPLE.test',password:'Four unusual otters juggle!',name:'Tester'});
 assert.equal(result.status,200,await result.clone().text());assert.equal(mail.length,1);
 const row=await db.prepare('SELECT * FROM user').first();assert.equal(row.email,'tester@example.test');assert.equal(row.emailVerified,0);assert.equal(row.signupIpHash.length,64);
 const denied=await post('/api/auth/sign-in/email',{email:row.email,password:'Four unusual otters juggle!'});assert.equal(denied.status,403,await denied.clone().text());
 const url=mail[0].text.match(/http:\/\/localhost\/api\/auth\/verify-email\?\S+/)[0];
 const verified=await mf.dispatchFetch(url,{redirect:'manual'});assert.equal(verified.status,302,await verified.clone().text());
 const login=await post('/api/auth/sign-in/email',{email:row.email,password:'Four unusual otters juggle!'});assert.equal(login.status,200,await login.clone().text());
 const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 assert.ok(cookie.includes('dm.session_token'));
 const nodes=await mf.dispatchFetch('http://localhost/account-api/nodes',{headers:{Cookie:cookie}});assert.equal(nodes.status,200,await nodes.clone().text());
 }finally{await mf.dispose();}
});
