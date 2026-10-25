import {deviceReferences} from './security-device-references.mjs';
import {aircraftReferences} from './aircraft-references.mjs';
import {dronePlatforms} from './drone-platforms.mjs';
export function libraryModels(){
 const vendors=new Map(deviceReferences.vendors.map(v=>[v.id,v.name]));
 return [...deviceReferences.models.map(m=>({...m,maker:vendors.get(m.vendor)||m.vendor})),
 ...aircraftReferences.models.map(m=>({...m,maker:m.manufacturer,source:m.sources?.[0]||m.url})),
 ...dronePlatforms.models.map(m=>({...m,maker:m.manufacturer,source:m.sources?.[0]||m.url}))]
 .map(m=>({...m,aliases:m.aliases||[],reception:m.reception||'No model-specific reception signature established in this reference.'}))
 .map(m=>m.vendor==='anduril'?{...m,reference_notes:'Android 0.8.5 and Desktop 0.6.4 recognize verified Anduril radio allocations in local Wi-Fi observations; Desktop also supports observed ARP senders on a selected local network. Anduril Industries: E8:B4:70:C… (28-bit IEEE MA-M). Anduril Imaging: 8C:1F:64:76:3… (36-bit IEEE MA-S). These identify radio registrants, not this model or its operator. Hints remain local and do not create map sightings. Third-party radios, changed addresses and non-Wi-Fi links may not match. Remote ID and supported decoders operate independently; RF spectrum alone does not identify a product.',related_links:[...(m.related_links||[]),{name:'IEEE MA-M registry',url:'https://standards-oui.ieee.org/oui28/mam.csv'},{name:'IEEE MA-S registry',url:'https://standards-oui.ieee.org/oui36/oui36.csv'},{name:'Reception and research notes',url:'https://dronemapper.churchofmalware.org/downloads/anduril-warhound.md'}]}:m)
 .sort((a,b)=>a.maker.localeCompare(b.maker)||a.name.localeCompare(b.name));
}
