import {deviceReferences} from './security-device-references.mjs';
import {aircraftReferences} from './aircraft-references.mjs';
import {dronePlatforms} from './drone-platforms.mjs';
export function libraryModels(){
 const vendors=new Map(deviceReferences.vendors.map(v=>[v.id,v.name]));
 return [...deviceReferences.models.map(m=>({...m,maker:vendors.get(m.vendor)||m.vendor})),
 ...aircraftReferences.models.map(m=>({...m,maker:m.manufacturer,source:m.sources?.[0]||m.url})),
 ...dronePlatforms.models.map(m=>({...m,maker:m.manufacturer,source:m.sources?.[0]||m.url}))]
 .map(m=>({...m,aliases:m.aliases||[],reception:m.reception||'No model-specific reception signature established in this reference.'}))
 .sort((a,b)=>a.maker.localeCompare(b.maker)||a.name.localeCompare(b.name));
}
