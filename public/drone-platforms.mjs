// Church of Malware / saviorSEC. SPDX-License-Identifier: AGPL-3.0-or-later
import {dronePlatforms} from './drone-platform-data.mjs';
export {dronePlatforms};
const normalize = value => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

// Exact reviewed model and manufacturer only. No SSID, OUI or operator inference.
export function dronePlatform(manufacturer, model, kind = 'drone') {
  if (kind !== 'drone' || !normalize(manufacturer) || !normalize(model)) return null;
  return dronePlatforms.models.find(item =>
    item.manufacturer_aliases.some(name => normalize(name) === normalize(manufacturer)) &&
    item.aliases.some(name => normalize(name) === normalize(model))) || null;
}
