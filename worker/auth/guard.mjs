
import {DurableObject} from 'cloudflare:workers';
import {createHash,randomBytes} from 'node:crypto';
export class AccountGuard extends DurableObject{
 constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS budgets(k TEXT PRIMARY KEY,n INTEGER NOT NULL,expires INTEGER NOT NULL)');ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pairs(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,challenge TEXT NOT NULL,client TEXT NOT NULL,label TEXT NOT NULL,expires INTEGER NOT NULL,owner TEXT,consumed INTEGER NOT NULL DEFAULT 0)');}
 prune(){const now=Date.now();this.ctx.storage.sql.exec('DELETE FROM budgets WHERE expires<?',now);this.ctx.storage.sql.exec('DELETE FROM pairs WHERE expires<?',now);}
 async alarm(){this.prune();if([...this.ctx.storage.sql.exec('SELECT 1 FROM pairs LIMIT 1')].length||[...this.ctx.storage.sql.exec('SELECT 1 FROM budgets LIMIT 1')].length)await this.ctx.storage.setAlarm(Date.now()+3600000);}
 async permit(ip,kind,email){
  this.prune();const now=Date.now();
  const limits=kind==='signup'?[[ip+':signup',5,3600000],['global:signup',100,3600000]]:kind==='mail'?[[ip+':mail',5,3600000],['global:mail',150,3600000]]:kind==='start'?[[ip+':start',6,600000],['global:start',300,600000]]:kind==='poll'?[[ip+':poll',24,60000],['global:poll',3000,60000]]:[[ip+':auth',30,60000],['global:auth',600,60000]];
  if(email)limits.push(['email:'+email+':'+kind,kind==='login'?10:3,kind==='login'?900000:3600000]);
  const allowed=this.ctx.storage.transactionSync(()=>{
   let ok=true;
   for(const [key,max,ttl] of limits){
    const row=[...this.ctx.storage.sql.exec('INSERT INTO budgets(k,n,expires) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=n+1 RETURNING n',key,now+ttl)][0];
    if(row.n>max)ok=false;
   }return ok;
  });
  if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+3600000);
  return allowed;
 }
 async start(client,challenge,label){
  this.prune();if([...this.ctx.storage.sql.exec('SELECT COUNT(*) n FROM pairs')][0].n>=10000)throw Error('busy');
  const id=crypto.randomUUID(),code=randomBytes(5).toString('hex').toUpperCase(),expires=Date.now()+600000;
  this.ctx.storage.sql.exec('INSERT INTO pairs(id,code,challenge,client,label,expires) VALUES(?,?,?,?,?,?)',id,code,challenge,client,label,expires);
  return {device_id:id,user_code:code.slice(0,5)+'-'+code.slice(5),expires_at:expires};
 }
 async details(code){this.prune();const r=[...this.ctx.storage.sql.exec('SELECT code,label,owner,client FROM pairs WHERE code=?',code)][0];return r?{code:r.code,label:r.label,approved:!!r.owner,client_suffix:r.client.slice(-4)}:null;}
 async approve(code,owner){this.prune();const rows=[...this.ctx.storage.sql.exec('UPDATE pairs SET owner=? WHERE code=? AND owner IS NULL RETURNING id',owner,code)];return rows.length===1;}
 async poll(id,verifier){
  this.prune();const row=[...this.ctx.storage.sql.exec('SELECT * FROM pairs WHERE id=?',id)][0];
  if(!row||createHash('sha256').update(verifier).digest('base64url')!==row.challenge)return {status:'expired'};
  if(!row.owner)return {status:'pending'};
  // The native caller proves possession of its private verifier; repeated polls return
  // the same credential from the node service, rather than creating extra nodes.
  this.ctx.storage.sql.exec('UPDATE pairs SET consumed=1 WHERE id=?',id);
  let result;try{result=await this.env.NODES.getByName('community').connectAccount(row.owner,row.client,row.label,row.id,!row.consumed);}catch{return {status:'expired'};}
  const profile=await this.env.AUTH_DB.prepare('SELECT name FROM user WHERE id=?').bind(row.owner).first();
  return {status:'connected',...result,display_name:profile?.name||'Anonymous'};
 }
}
