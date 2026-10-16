
import {createAuthClient} from 'better-auth/client';
import {twoFactorClient} from 'better-auth/client/plugins';
import QRCode from 'qrcode';
const auth=createAuthClient({baseURL:location.origin,basePath:'/api/auth',plugins:[twoFactorClient()]});
const root=document.querySelector('#account-content'),status=document.querySelector('#account-message');
const params=new URLSearchParams(location.search);
let pair=(params.get('device')||sessionStorage.getItem('dm-pair')||'').toUpperCase();
if(pair)sessionStorage.setItem('dm-pair',pair);
let resetToken=params.get('token');
if(resetToken)history.replaceState(null,'',location.pathname);
let user=null;
const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text)n.textContent=text;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
function message(text=''){status.textContent=text;}
function clear(title){root.replaceChildren(el('h2',title));message();}
function note(text){root.append(el('p',text));}
function field(parent,label,type='text',autocomplete='off'){
 const id='field-'+Math.random().toString(36).slice(2);parent.append(el('label',label,{for:id}));
 const n=el('input','',{id,type,autocomplete,required:''});parent.append(n);return n;
}
function button(parent,label,action,secondary=false){
 const n=el('button',label,{type:'button'});if(secondary)n.className='secondary';parent.append(n);
 n.addEventListener('click',async()=>{n.disabled=true;message();try{await action();}catch(e){message(e.message||'Unable to complete this request. Please try again later.');}finally{n.disabled=false;}});return n;
}
async function invoke(promise){const result=await promise;if(result.error)throw Error(result.error.status===429?'Unable to complete this request. Please try again later.':result.error.message||'Unable to complete this request.');return result.data;}
async function api(path,body){
 const response=await fetch('/account-api/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to complete this request.');return result;
}
function credentials(signup=false){
 clear(signup?'Create your account':'Welcome back');
 const tabs=el('div','',{class:'account-tabs'});root.append(tabs);
 button(tabs,'Sign in',()=>credentials(false),signup);button(tabs,'Create account',()=>credentials(true),!signup);
 const form=el('form');root.append(form);
 let alias=null;if(signup){alias=field(form,'Display name (optional)');alias.required=false;alias.maxLength=32;alias.placeholder='Anonymous';}
 const email=field(form,'Email address','email','email'),password=field(form,'Password','password',signup?'new-password':'current-password');
 password.maxLength=128;if(signup){password.minLength=15;form.append(el('small','Use a unique passphrase of 15–128 characters.'));}
 const submit=el('button',signup?'Create account':'Sign in',{type:'submit'});form.append(submit);
 form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;message();try{
  if(signup){await invoke(auth.signUp.email({email:email.value.trim(),password:password.value,name:alias?.value.trim()||'Anonymous',callbackURL:location.origin+'/account.html'}));password.value='';verification(email.value);}
  else{const data=await invoke(auth.signIn.email({email:email.value.trim(),password:password.value}));password.value='';if(data.twoFactorRedirect)secondFactor();else await dashboard();}
 }catch(error){message(error.message);}finally{submit.disabled=false;}});
 if(!signup){button(root,'Forgot password?',()=>forgot(),true);button(root,'Resend verification email',()=>verification(email.value),true);}
 note('Your email stays private. Contributions are anonymous unless you choose to display your name in your profile.');
}
function verification(email=''){
 clear('Check your email');note('Open the verification link, then return here to sign in.');
 const input=field(root,'Email address','email','email');input.value=email;
 button(root,'Send verification email',async()=>{if(!input.reportValidity())return;await invoke(auth.sendVerificationEmail({email:input.value.trim(),callbackURL:location.origin+'/account.html'}));message('If verification is needed, an email is on its way.');});
 button(root,'Back to sign in',()=>credentials(),true);
}
function forgot(){
 clear('Reset your password');const email=field(root,'Email address','email','email');
 button(root,'Send reset link',async()=>{if(!email.reportValidity())return;await invoke(auth.requestPasswordReset({email:email.value.trim(),redirectTo:location.origin+'/account.html'}));message('If this email belongs to an account, a reset link is on its way.');});
 button(root,'Back to sign in',()=>credentials(),true);
}
function reset(){
 clear('Choose a new password');const password=field(root,'New password','password','new-password');password.minLength=15;password.maxLength=128;
 note('Use a unique passphrase of 15–128 characters.');
 button(root,'Save password',async()=>{if(!password.reportValidity())return;await invoke(auth.resetPassword({token:resetToken,newPassword:password.value}));password.value='';resetToken=null;credentials();message('Password changed. Sign in to continue.');});
}
function secondFactor(backup=false){
 clear(backup?'Use a recovery code':'Authenticator code');const code=field(root,backup?'Recovery code':'Six-digit code','text','one-time-code');
 if(!backup){code.inputMode='numeric';code.pattern='[0-9]{6}';}
 button(root,'Verify',async()=>{if(!code.reportValidity())return;await invoke(backup?auth.twoFactor.verifyBackupCode({code:code.value.trim(),trustDevice:false}):auth.twoFactor.verifyTotp({code:code.value.trim(),trustDevice:false}));code.value='';await dashboard();});
 button(root,backup?'Use authenticator instead':'Use a recovery code',()=>secondFactor(!backup),true);
}
async function dashboard(){
 const data=await invoke(auth.getSession());user=data?.user;if(!user?.emailVerified){credentials();return;}
 clear('Your scanner account');note(user.email);
 if(pair){try{await pairing(pair);return;}catch(error){pair='';sessionStorage.removeItem('dm-pair');message(error.message);}}
 button(root,'Open world map ↗',()=>{location.href='/';});
 root.append(el('h3','Connect a phone'));note('Tap “Connect to DRONEmapper” in the app. Or enter the code displayed on your phone.');
 const code=field(root,'Connection code');button(root,'Continue',()=>pairing(code.value.trim().toUpperCase()));
 root.append(el('h3','Your nodes'));
 const {nodes}=await api('nodes');if(!nodes.length)note('No phones connected yet.');
 for(const node of nodes){const card=el('div','',{class:'node-card'});card.append(el('strong',node.label||'Android scanner'));card.append(el('p',node.online?'Online':node.last_seen?'Last active '+new Date(node.last_seen*1000).toLocaleString():'Waiting for first scan'));root.append(card);
  button(card,'Remove node and its reports',async()=>{if(!confirm('Disconnect this node and remove its contributed observations?'))return;await api('nodes/revoke',{node_handle:node.handle});await dashboard();},true);
 }
 root.append(el('h3','Your profile'));note('Display name: '+user.name);button(root,'Display name & anonymity',()=>profile(),true);
 root.append(el('h3','Account security'));note(user.twoFactorEnabled?'Authenticator protection is on.':'Add an authenticator app for a second sign-in step.');
 button(root,user.twoFactorEnabled?'Manage two-factor authentication':'Set up two-factor authentication',()=>security(),true);
 button(root,'Change password',()=>changePassword(),true);
 button(root,'Sign out',async()=>{await invoke(auth.signOut());user=null;credentials();},true);
}
async function pairing(value){
 const details=await api('device/details',{code:value});
 clear('Connect this phone');root.append(el('strong',details.label));root.append(el('span',value,{class:'device-code'}));
 note('Check that this code matches the one shown in your DRONEmapper app. Approve only a phone you are connecting yourself.');
 button(root,'Connect this phone',async()=>{await api('device/approve',{code:value});pair='';sessionStorage.removeItem('dm-pair');clear('Phone approved');note('Return to the app to finish connecting and choose what to share.');button(root,'Your account',dashboard);});
 button(root,'Cancel',async()=>{pair='';sessionStorage.removeItem('dm-pair');await dashboard();},true);
}
function profile(){
 clear('Display name & anonymity');
 const name=field(root,'Display name (optional)');name.required=false;name.maxLength=32;name.placeholder='Anonymous';name.value=user.name==='Anonymous'?'':user.name;
 const label=el('label','',{class:'check-label'}),publish=el('input','',{type:'checkbox'});publish.checked=!!user.publicName;label.append(publish,document.createTextNode('Show my display name with map contributions'));root.append(label);
 note('Leave the name blank to remain Anonymous. Your email is never shown on the map. A public display name is a nickname, not a verified identity.');
 button(root,'Save profile',async()=>{await api('profile',{name:name.value.trim(),public_name:publish.checked});await dashboard();message('Profile saved.');});
 button(root,'Back to account',dashboard,true);
}
function security(){
 clear('Two-factor authentication');const password=field(root,'Confirm your password','password','current-password');
 if(user.twoFactorEnabled){
  button(root,'Generate new recovery codes',async()=>{const d=await invoke(auth.twoFactor.generateBackupCodes({password:password.value}));password.value='';showCodes(d.backupCodes);});
  button(root,'Turn off two-factor authentication',async()=>{await invoke(auth.twoFactor.disable({password:password.value}));password.value='';await dashboard();},true);
 }else button(root,'Set up authenticator',async()=>{
  const d=await invoke(auth.twoFactor.enable({password:password.value,method:'totp',issuer:'DRONEmapper · saviorSEC'}));password.value='';
  clear('Add DRONEmapper to your authenticator');note('Scan this QR code with your authenticator, or use the setup key below.');
  const canvas=el('canvas');root.append(canvas);await QRCode.toCanvas(canvas,d.totpURI,{width:240,errorCorrectionLevel:'M'});
  const secret=new URL(d.totpURI).searchParams.get('secret');root.append(el('pre',secret));
  showCodes(d.backupCodes);const code=field(root,'Authenticator code','text','one-time-code');code.inputMode='numeric';code.pattern='[0-9]{6}';
  button(root,'Enable two-factor authentication',async()=>{if(!code.reportValidity())return;await invoke(auth.twoFactor.verifyTotp({code:code.value.trim(),trustDevice:false}));await dashboard();message('Two-factor authentication is on.');});
 });
 button(root,'Back to account',dashboard,true);
}
function showCodes(codes){note('Save these recovery codes somewhere private. Each can be used once if you lose your authenticator.');root.append(el('pre',codes.join('\n')));}
function changePassword(){
 clear('Change password');const current=field(root,'Current password','password','current-password'),next=field(root,'New password','password','new-password');next.minLength=15;next.maxLength=128;
 button(root,'Save new password',async()=>{if(!next.reportValidity())return;await invoke(auth.changePassword({currentPassword:current.value,newPassword:next.value,revokeOtherSessions:true}));current.value=next.value='';await dashboard();message('Password changed.');});button(root,'Back to account',dashboard,true);
}
if(resetToken)reset();else dashboard().catch(error=>{credentials();message(error.message);});
