import {aircraftReference,aircraftReferences} from './aircraft-references.mjs';
import {deviceReference,deviceManufacturer} from './security-device-references.mjs';
// Whole-name matches only: never guess a website or a model from a prefix.
import {companyLinks, modelLinks} from './device-link-data.mjs';

const normalize = value => typeof value === 'string'
  ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const key = (manufacturer, model, kind = '') =>
  JSON.stringify([normalize(manufacturer), normalize(model), normalize(kind)]);
const companies = new Map(Object.entries(companyLinks).map(([name, url]) => [normalize(name), url]));
const models = new Map(modelLinks.map(([manufacturer, model, kind, url]) =>
  [key(manufacturer, model, kind), url]));

export function companyWebsite(name) {
  return companies.get(normalize(name)) || deviceManufacturer(name)?.url || aircraftReferences.models.find(m=>m.manufacturer_aliases.some(a=>normalize(a)===normalize(name)))?.manufacturer_url || null;
}

export function modelWebsite(model, manufacturer, kind) {
  if (!normalize(model)) return null;
  // Unbranded historic/float names need their device kind to avoid namesakes.
  // A supplied manufacturer never falls back to a different or unknown maker.
  return models.get(key(manufacturer, model, kind))
    || models.get(key(manufacturer, model)) || deviceReference(manufacturer,model,kind)?.url || aircraftReference(manufacturer,model,kind)?.url || null;
}
