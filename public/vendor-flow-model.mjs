import {servicesForVendor,canonicalVendor} from './map-device-coverage.mjs';
const lattice='https://developer.anduril.com/guides/concepts/overview';
const api='https://developer.anduril.com/reference/overview/overview';
export function vendorFlow(vendor){
 const services=servicesForVendor(vendor);
 const nodes=[],edges=[];
 const add=(id,name,x,y,service,zone)=>nodes.push({id,name,x,y,service,zone});
 if(canonicalVendor(vendor)==='anduril industries'){
  const service=services.find(s=>s.id==='lattice');
  if(service){
   [['asset','Integrated robot / sensor',80,260,'Device / integration'],['adapter','Integration application',330,260,'Integration boundary'],['entities','Entities / Tasks APIs',610,140,'Authorized platform'],['objects','Objects API',610,380,'Authorized platform'],['video','Video API',610,620,'Authorized platform'],['nodes','Lattice nodes',880,140,'Distributed deployment'],['apps','Authorized apps / operators',1150,320,'Application boundary']].forEach(([id,name,x,y,zone])=>add(id,name,x,y,service,zone));
   const edge=(from,to,label,data,source,bidirectional=false)=>edges.push({from,to,label,data,source,bidirectional,service,boundary:'Authorization and deployment configuration govern this interface.'});
   edge('asset','adapter','Device-specific integration','Device implementation and physical radio transport are not specified by the platform API.',lattice,true);
   edge('adapter','entities','REST / gRPC','Entities and task interfaces.',lattice,true);
   edge('adapter','objects','REST','Binary objects / file operations.',lattice,true);
   edge('adapter','video','Video interface','Live camera and sensor feed integration; exact transport requires the specific video API.',api);
   edge('entities','nodes','Internal gRPC / Protobuf','Distributed Lattice data exchange.',lattice,true);
   edge('entities','apps','REST / gRPC','Entity observations and authorized task workflows.',lattice,true);
   edge('objects','apps','REST','Authorized object access.',lattice,true);
   edge('video','apps','Video interface','Authorized video consumption.',api);
  }
 }else services.forEach((s,i)=>{
  s.path.forEach((name,j)=>add(i+':'+j,name,100+j*300,150+i*360,s,j===0?'Device / upstream':j===s.path.length-1?'Application / downstream':'Service / intermediary'));
  s.path.slice(1).forEach((_,j)=>edges.push({from:i+':'+j,to:i+':'+(j+1),label:'Documented path',data:s.data,source:s.source,service:s,boundary:s.access,bidirectional:false,directionUnverified:true}));
 });
 return {vendor,services,nodes,edges,complete:false};
}
