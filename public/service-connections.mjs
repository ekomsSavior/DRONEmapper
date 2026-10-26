// Evidence belongs to an individual connection, not merely its vendor.
export function serviceConnections(service){
 const links=service.links ?? service.path.slice(1).map((_,i)=>({from_index:i,to_index:i+1,label:'Documented communications path',data:service.data,source:service.source,direction:'unspecified',boundary:service.access}));
 return links.map(link=>{
  if(!Number.isInteger(link.from_index)||!Number.isInteger(link.to_index)||link.from_index<0||link.to_index<0||link.from_index>=service.path.length||link.to_index>=service.path.length||link.from_index===link.to_index)throw new Error('Invalid path connection: '+service.id);
  if(!['forward','both','unspecified'].includes(link.direction)||!link.source||!link.label)throw new Error('Missing connection evidence: '+service.id);
  return {...link,service,bidirectional:link.direction==='both',directionUnverified:link.direction==='unspecified'};
 });
}
