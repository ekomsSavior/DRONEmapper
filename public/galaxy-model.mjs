import {cloudSurfaces} from './cloud-surface-data.mjs';
export function buildGalaxy(catalog=cloudSurfaces){
 const nodes=[],edges=[],vendors=new Map();
 for(const [i,s] of catalog.services.entries()){
  const x=240+(i%4)*540,y=210+Math.floor(i/4)*430;
  nodes.push({id:s.id,name:s.name,type:'service',x,y,service:s});
  if(!vendors.has(s.vendor)){const v={id:'vendor:'+s.vendor,name:s.vendor,type:'vendor',x:x-145,y:y-125,service:s};vendors.set(s.vendor,v);nodes.push(v);}
  edges.push({from:vendors.get(s.vendor).id,to:s.id,label:'Published platform / vendor association',source:s.source,service:s});
  s.path.forEach((name,j)=>{
   const angle=(j/s.path.length)*Math.PI*2-.6;
   const id=s.id+':path:'+j;nodes.push({id,name,type:j===0?'device':'connection',x:x+145*Math.cos(angle),y:y+145*Math.sin(angle),service:s});
   edges.push({from:j?s.id+':path:'+(j-1):s.id,to:id,label:j?'Documented communications path':'Documented architecture includes',source:s.source,service:s});
  });
 }
 if(nodes.some(n=>n.id==='skydio')&&nodes.some(n=>n.id==='fusus'))edges.push({from:'skydio',to:'fusus',label:'Video, telemetry and flight-state integration',source:catalog.services.find(s=>s.id==='fusus').source,service:catalog.services.find(s=>s.id==='fusus')});
 for(const [from,to,label] of [['skydio','axon-air','Skydio cloud streaming into Axon Respond'],['flytbase','dronedeploy','Listed Flinks data-platform integration']]){const s=catalog.services.find(s=>s.id===from),target=catalog.services.find(s=>s.id===to);if(s&&target)edges.push({from,to,label,source:from==='skydio'?target.source:s.source,service:from==='skydio'?target:s});}
 for(const c of catalog.connections||[]){const a=nodes.find(n=>n.id===c.from_id),b=nodes.find(n=>n.id===c.to_id);if(a&&b)edges.push({from:a.id,to:b.id,label:c.label,source:c.source,service:b.service});}
 return {nodes,edges};
}
