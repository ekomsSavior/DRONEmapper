import {libraryModels} from './device-library-model.mjs';
import {deviceReferences} from './security-device-references.mjs';
import {cloudSurfaces} from './cloud-surface-data.mjs?v=20261026-networks-333';
import {companyWebsite,modelWebsite} from './company-links.mjs';
export async function loadMapInventory(){
 let r=await fetch('/api/device-library');if(!r.ok)r=await fetch('/device-inventory.json');
 if(!r.ok)throw new Error('Map inventory unavailable');const data=await r.json();if(!Array.isArray(data.models))throw new Error('Invalid inventory');return data;
}
// Only catalogued aliases are normalized; no fuzzy corporate or network inference.
export function canonicalVendor(name){
 const key=String(name||'Unknown manufacturer').trim().toLowerCase();
 const v=deviceReferences.vendors.find(v=>[v.name,...(v.aliases||[])].some(a=>a.toLowerCase()===key));
 if(v)return v.name.toLowerCase();
 if(key==='general atomics aeronautical systems')return 'general atomics';
 return key;
}
export function researchInventory(mapModels){
 const rows=libraryModels().map(m=>({...m,records:0,record_types:{},operators:[],reference:true}));
 for(const row of mapModels){
  const known=rows.find(m=>canonicalVendor(m.maker)===canonicalVendor(row.maker)&&[m.name,m.model,...(m.aliases||[])].filter(Boolean).some(n=>n.toLowerCase()===row.name.toLowerCase()));
  if(known){known.records+=row.records;for(const [k,v] of Object.entries(row.record_types))known.record_types[k]=(known.record_types[k]||0)+v;known.operators=[...new Set([...known.operators,...row.operators])];}
  else rows.push({...row,reference:false});
 }
 return rows;
}
export function servicesForVendor(vendor){
 const key=canonicalVendor(vendor);
 return cloudSurfaces.services.filter(s=>canonicalVendor(s.vendor)===key||(s.map_vendor_names||[]).some(n=>n.source&&n.scope&&canonicalVendor(n.name)===key));
}
export function deviceLinks(row){return {product:row.url||modelWebsite(row.name,row.maker,row.category),manufacturer:row.manufacturer_url||companyWebsite(row.maker),library:'/devices?vendor='+encodeURIComponent(row.maker)+'&model='+encodeURIComponent(row.name),cloud:'/cloud-surface?vendor='+encodeURIComponent(row.maker),galaxy:'/galaxy?vendor='+encodeURIComponent(row.maker)};}
export function vendorInventory(models){const vendors=new Map();for(const row of models){if(!vendors.has(row.maker))vendors.set(row.maker,[]);vendors.get(row.maker).push(row);}return [...vendors].sort(([a],[b])=>a.localeCompare(b));}
