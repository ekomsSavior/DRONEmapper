// Event time, never collection time, determines map freshness.
export const GHOST_SECONDS=14*86400;
export const isPoliceFlight=r=>r.kind==='drone'&&(r.operator_type?['police','police-and-fire'].includes(r.operator_type):r.purpose==='public-safety');
export function isLiveRecord(r,now=Date.now()/1000){
 return r.record_type==='position'&&r.live!==false&&!r.position_conflict&&!['wardrive-import','scanner-archive'].includes(r.source_type)&&Number.isFinite(r.observed_at)&&r.observed_at<=now&&now-r.observed_at<=120;
}
export function flightEnd(r){
 if(r.status!=='published-flight')return null;
 if(Number.isFinite(r.flight_ended_at))return r.flight_ended_at;
 const day=r.event_date;
 if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const stamp=Date.parse(day+'T00:00:00Z')/1000;
 return Number.isFinite(stamp)&&new Date(stamp*1000).toISOString().slice(0,10)===day?stamp+86400:null;
}
export function isGhostRecord(r,now=Date.now()/1000){
 const stamp=r.profile_id?(r.last_seen??r.observed_at):flightEnd(r);
 return Number.isFinite(stamp)&&now-stamp>=GHOST_SECONDS;
}
export function withinTimeWindow(r,hours,now=Date.now()/1000){
 if(!hours)return true;
 const stamp=r.status==='published-flight'?r.flight_started_at:r.observed_at;
 return Number.isFinite(stamp)&&stamp<=now&&now-stamp<=hours*3600;
}

export function recordTime(r){
 if(Number.isFinite(r.observed_at))return r.observed_at;
 if(Number.isFinite(r.flight_started_at))return r.flight_started_at;
 if(r.status==='published-flight'&&flightEnd(r)!==null)return flightEnd(r)-86400;
 return 0;
}
