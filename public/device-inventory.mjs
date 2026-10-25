// Compact map inventory; deliberately excludes locations and individual radio addresses.
export function deviceInventory(feed){
 const groups=new Map();
 for(const r of [...(feed.tracks||[]),...(feed.activity||[])]){
  const name=String(r.model||'Unknown model').trim(),maker=String(r.manufacturer||'Unknown manufacturer').trim(),category=String(r.kind||'unknown');
  const key=JSON.stringify([maker.toLowerCase(),name.toLowerCase(),category]);
  if(!groups.has(key))groups.set(key,{name,maker,category,records:0,record_types:{},domains:[],operators:[],last_seen:null});
  const g=groups.get(key);g.records++;const type=r.record_type||'unknown';g.record_types[type]=(g.record_types[type]||0)+1;
  if(r.domain&&!g.domains.includes(r.domain))g.domains.push(r.domain);
  if(r.operator&&!g.operators.includes(r.operator)&&g.operators.length<8)g.operators.push(r.operator);
  const t=typeof r.observed_at==='number'?r.observed_at:Date.parse(r.observed_at)/1000;
  if(Number.isFinite(t)&&t>0)g.last_seen=Math.max(g.last_seen||0,t);
 }
 return {generated_at:feed.server_time,models:[...groups.values()].sort((a,b)=>a.maker.localeCompare(b.maker)||a.name.localeCompare(b.name))};
}
