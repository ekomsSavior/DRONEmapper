// Remove abandoned unverified registrations and expired auth state; verified users remain.
const milliseconds=field=>"(CASE WHEN typeof("+field+") IN ('integer','real') THEN "+field+" ELSE unixepoch("+field+")*1000 END)";
export async function cleanAccounts(db,now=Date.now()){
 if(!db)return;
 await db.batch([
  db.prepare('DELETE FROM user WHERE emailVerified=0 AND '+milliseconds('createdAt')+'<?').bind(now-86400000),
  db.prepare('DELETE FROM verification WHERE '+milliseconds('expiresAt')+'<?').bind(now-86400000),
  db.prepare('DELETE FROM session WHERE '+milliseconds('expiresAt')+'<?').bind(now-86400000),
  db.prepare('DELETE FROM rateLimit WHERE lastRequest<?').bind(now-86400000)
 ]);
}
