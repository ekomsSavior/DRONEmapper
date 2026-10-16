/* Church of Malware / saviorSEC · AGPL-3.0-or-later */
export const GHOST_AFTER=14*86400;
export function updateProfile(previous,record){
 if(record.record_type!=='position'||!Number.isFinite(record.observed_at))return previous;
 const old=previous||{data:record,first_seen:record.observed_at,last_seen:record.observed_at,observations:0};
 const fresh=!previous||record.observed_at>old.last_seen;
 return {data:record.observed_at>=old.last_seen?record:old.data,history:fresh?updateHistory(old.history,record):old.history,first_seen:Math.min(old.first_seen,record.observed_at),last_seen:Math.max(old.last_seen,record.observed_at),observations:old.observations+Number(fresh)};
}
export function profileRecord(profile,now){
 return {...profile.data,profile_id:profile.data.id,sighting_history:profile.history||[],first_seen:profile.first_seen,last_seen:profile.last_seen,observation_count:profile.observations,ghost:now-profile.last_seen>=GHOST_AFTER,identity_basis:'Same identifier in the position feed; identity is not independently authenticated',live:now>=profile.last_seen&&now-profile.last_seen<=120};
}

export function updateHistory(history=[],record){
 const day=new Date(record.observed_at*1000).toISOString().slice(0,10),out=history.map(h=>({...h})),old=out.find(h=>h.day===day);
 if(old){old.observations++;old.first_seen=Math.min(old.first_seen,record.observed_at);if(record.observed_at>=old.last_seen){old.last_seen=record.observed_at;old.latitude=record.latitude;old.longitude=record.longitude;}}
 else out.push({day,observations:1,first_seen:record.observed_at,last_seen:record.observed_at,latitude:record.latitude,longitude:record.longitude});
 return out.sort((a,b)=>a.day.localeCompare(b.day)).slice(-365);
}
