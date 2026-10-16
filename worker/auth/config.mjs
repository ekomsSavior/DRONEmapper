
import {betterAuth} from 'better-auth';
import {twoFactor} from 'better-auth/plugins/two-factor';
import {hashPassword,verifyPassword,GENERIC} from './security.mjs';

export function createAuth(env,ipHash=''){
 const send=async(to,subject,text)=>{
  const message={from:env.AUTH_FROM,to,subject,text};
  if(env.AUTH_TEST_MAIL){await env.AUTH_TEST_MAIL.fetch('https://test-mail/send',{method:'POST',body:JSON.stringify(message)});return;}
  if(env.AUTH_MAIL_PROVIDER==='cloudflare'&&env.AUTH_EMAIL){await env.AUTH_EMAIL.send(message);return;}
  if(env.AUTH_MAIL_PROVIDER==='resend'&&env.AUTH_MAIL_KEY){
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.AUTH_MAIL_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:'DRONEmapper <'+env.AUTH_FROM+'>',to:[to],reply_to:env.AUTH_REPLY_TO||env.AUTH_FROM,subject,text})});
   if(response.ok)return;
  }
  throw Error('Email delivery unavailable');
 };
 return betterAuth({
  appName:'DRONEmapper',baseURL:env.AUTH_ORIGIN,basePath:'/api/auth',secret:env.AUTH_SECRET,
  database:env.AUTH_DB,telemetry:{enabled:false},
  trustedOrigins:[env.AUTH_ORIGIN],
  logger:{disabled:true},
  emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:15,maxPasswordLength:128,
   password:{hash:hashPassword,verify:verifyPassword},revokeSessionsOnPasswordReset:true,
   sendResetPassword:async({user,url})=>send(user.email,'Reset your DRONEmapper password','Use this link to reset your DRONEmapper password:\n\n'+url+'\n\nIf you did not request this, ignore this email.\nChurch of Malware · saviorSEC'),
  },
  emailVerification:{sendOnSignUp:true,sendOnSignIn:false,autoSignInAfterVerification:false,expiresIn:3600,
   sendVerificationEmail:async({user,url})=>send(user.email,'Verify your DRONEmapper email','Verify your email to connect a scanner node:\n\n'+url+'\n\nIf you did not request this account, ignore this email.\nChurch of Malware · saviorSEC')},
  session:{expiresIn:7*86400,updateAge:86400,freshAge:900,cookieCache:{enabled:false}},
  user:{additionalFields:{publicName:{type:'boolean',required:false,input:false,defaultValue:false},signupIpHash:{type:'string',required:true,input:false,returned:false,defaultValue:''}}},
  databaseHooks:{user:{create:{before:async(user)=>{if(!ipHash)throw Error(GENERIC);return {data:{...user,signupIpHash:ipHash}};}}}},
  advanced:{useSecureCookies:env.AUTH_LOCAL_TEST!=='true',cookiePrefix:'dm',ipAddress:{ipAddressHeaders:['cf-connecting-ip']},defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:env.AUTH_LOCAL_TEST!=='true'}},
  rateLimit:{enabled:true,storage:'database',window:60,max:30,customRules:{'/sign-up/email':{window:60,max:5},'/sign-in/email':{window:60,max:10},'/two-factor/*':{window:60,max:5}}},
  plugins:[twoFactor({issuer:'DRONEmapper · saviorSEC',backupCodeOptions:{amount:10,length:12,storeBackupCodes:'encrypted'},accountLockout:{enabled:true,maxFailedAttempts:5,durationSeconds:900}})]
 });
}
