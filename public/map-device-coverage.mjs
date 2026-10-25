import {cloudSurfaces} from './cloud-surface-data.mjs';
import {companyWebsite,modelWebsite} from './company-links.mjs';
export async function loadMapInventory(){
 let r=await fetch('/api/device-library');if(!r.ok)r=await fetch('/device-inventory.json');
 if(!r.ok)throw new Error('Map inventory unavailable');const data=await r.json();if(!Array.isArray(data.models))throw new Error('Invalid inventory');return data;
}
// Exact vendor matches only: a vendor's service is not proof that each model uses it.
export function servicesForVendor(vendor){return cloudSurfaces.services.filter(s=>s.vendor.toLowerCase()===vendor.toLowerCase());}
export function deviceLinks(row){return {product:modelWebsite(row.name,row.maker,row.category),manufacturer:companyWebsite(row.maker),library:'/devices?vendor='+encodeURIComponent(row.maker)+'&model='+encodeURIComponent(row.name),cloud:'/cloud-surface?vendor='+encodeURIComponent(row.maker),galaxy:'/galaxy?vendor='+encodeURIComponent(row.maker)};}
export function vendorInventory(models){const vendors=new Map();for(const row of models){if(!vendors.has(row.maker))vendors.set(row.maker,[]);vendors.get(row.maker).push(row);}return [...vendors].sort(([a],[b])=>a.localeCompare(b));}
