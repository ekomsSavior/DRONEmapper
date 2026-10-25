import {agencies} from './agency-flights.mjs';
const registry=[{id:'sfpd',agency:'San Francisco Police Department',refresh_seconds:3600,portal:'https://data.sf.gov/d/giw5-ttjs',max_records:50000},...agencies.map(a=>({...a,id:'police-'+a.id}))];
export function policeCoverage(providers,now=Date.now()/1000){
 const feeds=registry.map(a=>{const p=providers[a.id]||{},records=p.records||[],dates=records.map(r=>r.event_date).filter(Boolean).sort();return {id:a.id,agency:a.agency,operator_id:a.department_id||a.id,operator_type:a.operator_type||'police',portal:a.portal,records:records.length,newest_flight:dates.at(-1)||null,oldest_flight:dates[0]||null,last_checked:p.last_attempt||null,last_success:p.last_success||null,status:p.error?'delayed':p.last_success?'collecting':'pending',check_interval_seconds:a.refresh_seconds,coverage:p.coverage||null};});
 const programs=providers.atlas?.records||[];
 return {generated_at:now,configured_flight_feeds:feeds.length,feeds_with_records:feeds.filter(f=>f.records>0).length,configured_operators:new Set(feeds.map(f=>f.operator_id)).size,operators_with_records:new Set(feeds.filter(f=>f.records>0).map(f=>f.operator_id)).size,police_operators:new Set(feeds.filter(f=>['police','police-and-fire'].includes(f.operator_type)).map(f=>f.operator_id)).size,mapped_flights:feeds.reduce((n,f)=>n+f.records,0),documented_program_records:programs.length,feeds};
}
