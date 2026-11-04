import {profileMatches} from './device-profile-match.mjs';
import {robotRule} from './robot-signatures.mjs?v=20261104-radio';

export function radioProfilesFor(record,profiles){
 // A possible signal is not an authenticated make/model identification.
 if(record.record_type==='signal')return [];
 return profiles.filter(profile=>profileMatches(record,profile));
}
export function signalContext(record){
 const rule=robotRule(record.signature);
 const radio=rule?.transport==='ble'?'Bluetooth LE':
  'Wi-Fi'+(Number.isFinite(record.frequency_mhz)?` · ${record.frequency_mhz} MHz`:'');
 return {radio,rule,evidence:rule?
  rule.scope+' The marker is the rounded receiver area, not the robot position. Network names and full MAC addresses are not published.':
  'A node heard a Wi-Fi name pattern used by camera drones. Other devices or renamed access points can match. The marker is the rounded receiver area, not the drone location or radio range. Manufacturer and model are unconfirmed; network names and MAC addresses are not published.'};
}
