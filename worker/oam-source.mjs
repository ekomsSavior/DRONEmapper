// Dated UAV imagery footprints. No aircraft location or operator inference.
export const OAM_URL='https://api.openaerialmap.org/meta';
const YEAR=365*86400;
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const clean=v=>String(v??'').replaceAll('\0','').trim().slice(0,200);
const stamp=v=>typeof v==='string'&&v.endsWith('Z')?Date.parse(v)/1000:NaN;
export function normalizeOAM(payload,now=Date.now()/1000){
 if(payload?.meta?.provided_by!=='OpenAerialMap'||payload?.meta?.license!=='CC-BY 4.0'||!Array.isArray(payload?.results))throw Error('Invalid UAV imagery catalog');
 const records=new Map();
 for(const item of payload.results){
  if(item?.platform!=='uav')continue;
  const id=item._id,box=item.bbox,start=stamp(item.acquisition_start),end=stamp(item.acquisition_end);
  if(typeof id!=='string'||! /^[a-f0-9]{24}$/.test(id)||!finite(start,now-YEAR,now)||!finite(end,start,now)||!Array.isArray(box)||box.length!==4)continue;
  const [west,south,east,north]=box;
  if(!finite(west,-180,180)||!finite(east,-180,180)||!finite(south,-90,90)||!finite(north,-90,90)||east<=west||east-west>2||north<=south||north-south>2)continue;
  const title=clean(item.title);if(!title)continue;
  records.set(id,{id:'oam:'+id,record_type:'historical',kind:'drone',domain:'air',name:'UAV survey — '+title,model:null,manufacturer:null,operator:null,purpose:'unknown',latitude:(south+north)/2,longitude:(west+east)/2,place:title,status:'historical-survey',observed_at:null,record_dates:item.acquisition_start.slice(0,10)+' — '+item.acquisition_end.slice(0,10),archive_year:new Date(end*1000).getUTCFullYear(),precision:'Center of published imagery footprint; not an aircraft position',source:'oam',source_url:OAM_URL,evidence_url:'https://api.openaerialmap.org/meta/'+id,attribution:'OpenAerialMap / Open Imagery Network contributors'+(clean(item.provider)?' — '+clean(item.provider):''),license:'CC BY 4.0',license_url:'https://openaerialmap.org/legal/',verification:'Contributor-labeled UAV imagery; capture dates and footprint, not a flight count'});
 }return [...records.values()];
}
export async function fetchOAM(fetchJSON,now=Date.now()/1000){
 const query={platform:'uav',acquisition_from:new Date((now-YEAR)*1000).toISOString(),acquisition_to:new Date(now*1000).toISOString(),order_by:'_id',sort:'desc',limit:'100'};
 const page=n=>fetchJSON(OAM_URL+'?'+new URLSearchParams({...query,page:String(n)}));
 const first=await page(1),found=first?.meta?.found;
 if(!Number.isInteger(found)||found<0||found>3000)throw Error('UAV catalog pagination limit');
 const pages=[first],total=Math.ceil(found/100);let next=2;
 await Promise.all(Array.from({length:3},async()=>{while(next<=total){const n=next++;pages[n-1]=await page(n);}}));
 const records=new Map(),seen=new Set();
 for(const [i,payload] of pages.entries()){
  // The upstream page label can race; validate result sizes and unique IDs.
  if(payload?.meta?.found!==found||payload?.meta?.limit!==100||payload?.results?.length!==Math.min(100,Math.max(0,found-i*100)))throw Error('UAV catalog changed during pagination');
  for(const r of normalizeOAM(payload,now))records.set(r.id,r);
  for(const row of payload.results)seen.add(row?._id);
 }
 if(seen.size!==found)throw Error('Incomplete UAV catalog pagination');
 return {records:[...records.values()]};
}
