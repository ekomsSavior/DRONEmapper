// Church of Malware / saviorSEC. SPDX-License-Identifier: AGPL-3.0-or-later
import {aircraftReferences} from './aircraft-reference-data.mjs';
export {aircraftReferences};
const normalize=v=>typeof v==='string'?v.trim().replace(/\s+/g,' ').toLowerCase():'';
// A family code never selects an exact variant. No RF, OUI or operator inference.
export function aircraftReference(manufacturer,model,kind='drone') {
 if(!['drone','aircraft'].includes(kind)||!normalize(manufacturer)||!normalize(model))return null;
 return aircraftReferences.models.find(m=>m.manufacturer_aliases.some(a=>normalize(a)===normalize(manufacturer))&&m.aliases.some(a=>normalize(a)===normalize(model)))||null;
}
