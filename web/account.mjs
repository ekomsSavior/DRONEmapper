
import {createAuthClient} from 'better-auth/client';
import {twoFactorClient} from 'better-auth/client/plugins';
import QRCode from 'qrcode';
import {scanWardriveFile,uploadWardriveFile} from './wardrive-upload.mjs';
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
 button(root,'Wardrive logs & upload tokens',()=>wardrive(),true);
 root.append(el('p','Import older CSVs here. Record offline and upload saved trips from the Android app. See the workflows and supported devices below.'));
 root.append(el('a','Import, offline recording & export guide ↓',{href:'#wardrive-workflow'}));
 root.append(el('h3','Connect a scanner'));note('Choose “Connect to DRONEmapper” in the Android app or desktop node. Or enter the connection code shown there.');
 const code=field(root,'Connection code');button(root,'Continue',()=>pairing(code.value.trim().toUpperCase()));
 root.append(el('h3','Your nodes'));
 const {nodes}=await api('nodes');if(!nodes.length)note('No scanner nodes connected yet.');
 for(const node of nodes){const card=el('div','',{class:'node-card'});card.append(el('strong',node.label||'Scanner node'));card.append(el('p',node.scope==='wardrive'?(node.last_seen?'Wardrive uploader · last upload '+new Date(node.last_seen*1000).toLocaleString():'Wardrive uploader · no uploads yet'):node.online?'Online':node.last_seen?'Last active '+new Date(node.last_seen*1000).toLocaleString():'Waiting for first scan'));root.append(card);
  button(card,'Remove node and its reports',async()=>{if(!confirm('Disconnect this node and remove its contributed observations?'))return;await api('nodes/revoke',{node_handle:node.handle});await dashboard();},true);
 }
 root.append(el('h3','Your profile'));note('Display name: '+user.name);button(root,'Display name & anonymity',()=>profile(),true);
 root.append(el('h3','Account security'));note(user.twoFactorEnabled?'Authenticator protection is on.':'Add an authenticator app for a second sign-in step.');
 button(root,user.twoFactorEnabled?'Manage two-factor authentication':'Set up two-factor authentication',()=>security(),true);
 button(root,'Change password',()=>changePassword(),true);
 button(root,'Sign out',async()=>{await invoke(auth.signOut());user=null;credentials();},true);
}
function wardrive(){
 clear('Contribute wardrive logs');
 note('Import your WiGLE-format CSV exports. Matching camera-link names become possible signal areas; ordinary Wi-Fi and Bluetooth rows are skipped. This does not decode Remote ID or establish a device’s location.');
 root.append(el('p','For trips recorded in DRONEmapper, use Saved wardrives → Upload later in the app. You can also export those trips to compatible services.'));
 const workflowLink=el('p');workflowLink.append(el('a','Offline recording, exports & supported devices ↓',{href:'#wardrive-workflow'}));root.append(workflowLink);
 const guide=el('a','Setup, automatic uploads & API documentation ↗',{href:'/wardrives.html'});root.append(guide);
 root.append(el('h3','Create an upload token'));
 const label=field(root,'Uploader name');label.maxLength=80;label.placeholder='My Biscuit exports';
 const consentLabel=el('label','',{class:'check-label'}),consent=el('input','',{type:'checkbox'});
 consentLabel.append(consent,document.createTextNode('I want to contribute matching observations from logs I am allowed to share, as approximate public signal areas.'));root.append(consentLabel);
 note('The file is processed to find supported signals. Raw files, network names and MAC addresses are not retained. Only rounded areas, dates and matching evidence are saved. Revoke a token and its reports under Your nodes.');
 const issued=el('div');
 button(root,'Create upload token',async()=>{
  if(!label.reportValidity())return;if(!consent.checked)throw Error('Confirm sharing before creating a token.');
  const result=await api('wardrive/tokens',{label:label.value.trim(),consent:true});key.value=result.upload_token;
  issued.replaceChildren(el('p','Save this token now. It is shown once and is only allowed to upload wardrive logs.'));
  const secret=el('textarea','',{rows:'3',readonly:'','aria-label':'New wardrive upload token',spellcheck:'false'});secret.value=result.upload_token;issued.append(secret);
  button(issued,'Copy token',async()=>{await navigator.clipboard.writeText(result.upload_token);message('Token copied. Keep it private.');},true);
  message('Upload token created.');
 });
 root.append(issued);
 root.append(el('h3','Upload a completed export'));
 const key=field(root,'Upload token','password');key.pattern='[a-f0-9]{64}';key.maxLength=64;key.spellcheck=false;
 const file=field(root,'WiGLE CSV file','file');file.accept='.csv,.wiglecsv,.log,text/csv';
 const zone=field(root,'Timezone used by the export');zone.value='UTC';zone.placeholder='UTC or -07:00';
 note('Choose a completed CSV up to 256 MiB. Large files are read in chunks and matching rows upload automatically in batches. Keep this page open until finished.');
 note('WiGLE/Kismet exports generally use UTC. If your exporter uses local time without a timezone, enter its offset on the capture date, such as -07:00. The log’s FirstSeen field is preserved; uploading it never makes it live.');
 let preview=null,operation=null;const summary=el('p','',{role:'status'});root.append(summary);
 const invalidate=()=>{preview=null;summary.textContent='';};file.addEventListener('change',invalidate);zone.addEventListener('input',invalidate);
 const busy=async action=>{
  if(operation)return;
  operation=new AbortController();
  const controls=[...root.querySelectorAll('input,button,textarea')].map(n=>[n,n.disabled]);
  for(const [n] of controls)n.disabled=true;
  cancel.hidden=false;cancel.disabled=false;
  const preventLeave=e=>{e.preventDefault();e.returnValue='';};
  addEventListener('beforeunload',preventLeave);
  try{await action(operation.signal);}
  catch(e){message(e.name==='AbortError'?`Cancelled. ${e.accepted||0} observations confirmed. You can retry this file without double-counting.`:(e.batches?`${e.accepted} observations confirmed before stopping. ${e.message}`:e.message));}
  finally{operation=null;removeEventListener('beforeunload',preventLeave);for(const [n,disabled]of controls)n.disabled=disabled;cancel.hidden=true;}
 };
 const percent=p=>Math.min(100,Math.floor(100*p.bytesRead/Math.max(1,p.totalBytes)));
 button(root,'Preview matching observations',async()=>{
  const selected=file.files[0],timezone=zone.value.trim();preview=null;
  await busy(async signal=>{
   const now=Date.now()/1000,s=await scanWardriveFile(selected,timezone,{signal,now,onProgress:p=>{
    summary.textContent=`Reading ${percent(p)}% · ${p.summary.rows.toLocaleString()} rows checked`;
   }});
   preview={selected,timezone,summary:s,now};
   summary.textContent=`${s.rows.toLocaleString()} row${s.rows===1?'':'s'}: ${s.candidates.toLocaleString()} matching observation${s.candidates===1?'':'s'}, ${s.unrelated.toLocaleString()} unrelated, ${s.invalid.toLocaleString()} invalid, ${s.outside_time_window.toLocaleString()} outside the date window. Repeated sightings are skipped during upload.`;
  });
 });
 button(root,'Upload matching observations',async()=>{
  if(!key.reportValidity())return;
  if(!preview||preview.selected!==file.files[0]||preview.timezone!==zone.value.trim())throw Error('Preview this file first.');
  if(!preview.summary.candidates)throw Error('No supported observations to upload.');
  await busy(async signal=>{
   const result=await uploadWardriveFile(preview.selected,key.value.trim(),preview.timezone,{signal,now:preview.now,onProgress:p=>{
    summary.textContent=`${p.waiting?(p.retrying?'Retrying automatically':'Uploading in batches'):p.totalBytes===undefined?'Uploading':`Reading ${percent(p)}%`} · ${p.accepted.toLocaleString()} imported · ${p.duplicates.toLocaleString()} duplicates skipped · ${p.batches} batches complete`;
   }});
   summary.textContent=`Upload complete · ${result.batches} batch${result.batches===1?'':'es'} processed`;
   message(`Imported ${result.accepted.toLocaleString()} observation${result.accepted===1?'':'s'}; ${result.duplicates.toLocaleString()} duplicates skipped. Find them under Possible signals or Ghosts on the map.`);
  });
 });
 const cancel=button(root,'Cancel upload or preview',()=>operation?.abort(),true);cancel.hidden=true;
 button(root,'Back to account',dashboard,true);
}
async function pairing(value){
 const details=await api('device/details',{code:value});
 clear('Connect this node');root.append(el('strong',details.label));root.append(el('span',value,{class:'device-code'}));
 note('Check that this code matches the one shown in your Android app or desktop node. Approve only a device you are connecting yourself.');
 button(root,'Connect this node',async()=>{await api('device/approve',{code:value});pair='';sessionStorage.removeItem('dm-pair');clear('Node approved');note('Return to your scanner to finish connecting and choose what to share.');button(root,'Your account',dashboard);});
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
