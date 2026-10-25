import {deviceReferences} from './security-device-data.mjs';
export {deviceReferences};
const normalize = value => typeof value === 'string' ? value.trim().replace(/\s+/g,' ').toLowerCase() : '';
// Exact maker, model and device-kind context. No RF identity or operator inference.
export function deviceReference(manufacturer, model, kind) {
  if (!normalize(manufacturer) || !normalize(model) || !kind) return null;
  return deviceReferences.models.find(m => m.kinds?.includes(kind)
    && m.manufacturer_aliases?.some(a => normalize(a) === normalize(manufacturer))
    && m.aliases?.some(a => normalize(a) === normalize(model))) || null;
}
export function deviceManufacturer(name) {
  if (!normalize(name)) return null;
  return deviceReferences.vendors.find(v => [v.name,...(v.aliases||[])].some(a=>normalize(a)===normalize(name))) || null;
}
