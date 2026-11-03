import {deviceMacData} from './device-mac-data.mjs';
const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
const aliases=new Map(Object.entries(deviceMacData.manufacturer_aliases||{}).map(([alias,maker])=>[norm(alias),norm(maker)]));
const allocations=new Map();
for(const row of deviceMacData.allocations){
 const maker=norm(row.device.replace(/ devices$/,''));
 if(!allocations.has(maker))allocations.set(maker,[]);
 allocations.get(maker).push(row);
 aliases.set(norm(row.registrant),maker);
}
export function macAllocationsFor(maker){
 const key=norm(maker);
 return allocations.get(aliases.get(key)||key)||[];
}
export function formatMacPrefix(row){
 const {prefix,prefix_bits:bits}=row;
 if(![24,28,36].includes(bits)||!new RegExp(`^[0-9A-F]{${bits/4}}$`).test(prefix))throw Error('Invalid MAC allocation');
 if(bits===24)return prefix.match(/../g).join(':');
 return prefix.padEnd(12,'0').match(/../g).join(':')+'/'+bits;
}
export const macReviewedOn=deviceMacData.reviewed_on;
