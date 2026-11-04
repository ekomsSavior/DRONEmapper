// Exact model/configuration matching shared by the library and live-map references.
const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const aliases=new Map([
 ['unitree','unitree robotics'],['parrot drones','parrot'],['parrot drones sas','parrot'],
 ['skydio, inc.','skydio'],['anduril','anduril industries'],['aurora','aurora innovation'],
 ['nao robot','aldebaran robotics'],['cobalt ai','cobalt robotics'],
 ['percepto airmax','percepto'],
 ['fimi x8 se 2022 drone','fimi'],['fimi x8 tele drone','fimi'],
 ['kratos defense & security solutions','kratos defense'],
 ['kodiak robotics','kodiak ai'],
]);
const makerOf=r=>aliases.get(norm(r.maker||r.manufacturer))||norm(r.maker||r.manufacturer);
const namesOf=r=>new Set([r.name,r.model,...(r.aliases||[]),...(r.models||[])].filter(Boolean).map(norm));
const matches=(a,b)=>makerOf(a)===makerOf(b)&&[...namesOf(a)].some(n=>namesOf(b).has(n));
const fccKey=value=>String(value||'').trim().toUpperCase();
// Module documentation must be explicitly bound to an equipment identifier.
// Matching a vendor or product name alone cannot import an aircraft's BOM.
export const profileMatches=(record,profile)=>record.kind==='regulatory-equipment'
 ? makerOf(record)===makerOf(profile)&&Boolean(fccKey(record.fcc_id))&&
   (profile.fcc_ids||[]).some(id=>fccKey(id)===fccKey(record.fcc_id))
 : !profile.fcc_ids?.length&&(matches(record,profile)||
   (profile.record_bindings||[]).some(binding=>matches(record,binding)));
export {matches,makerOf,fccKey};
