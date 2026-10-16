// Isolated local review: in-memory database and captured email; never deploy this script.
import {authHarness} from '../tests/auth-harness.mjs';
import {writeFileSync} from 'node:fs';
const h=await authHarness({port:8784,origin:'http://localhost:8784'});
await h.mf.ready;
console.log('Account preview: http://localhost:8784/account.html (isolated data)');
setInterval(()=>{writeFileSync('/tmp/dronemapper-preview-mail.json',JSON.stringify(h.mail),{mode:0o600});},1000);
