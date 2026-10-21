#!/usr/bin/env node
// Audit a saved public feed without collecting coordinates or node identifiers.
import {readFileSync, writeFileSync} from 'node:fs';
import {companyWebsite, modelWebsite} from '../public/company-links.mjs';

const [input, output] = process.argv.slice(2);
if (!input) throw Error('Usage: node scripts/audit_device_links.mjs feed.json [report.json]');
const data = JSON.parse(readFileSync(input, 'utf8'));
const records = Array.isArray(data) ? data : data.activity;
if (!Array.isArray(records)) throw Error('Expected a feed with an activity array');
const companies = new Map(), models = new Map();
const name = value => typeof value === 'string' ? value.trim() : '';
for (const record of records) {
  if (!record || typeof record !== 'object') continue;
  for (const manufacturer of [name(record.manufacturer), name(record.module_manufacturer)]) {
    if (!manufacturer) continue;
    const item = companies.get(manufacturer) || {manufacturer, count: 0, url: companyWebsite(manufacturer)};
    item.count++; companies.set(manufacturer, item);
  }
  for (const [model, manufacturer, kind] of [
    [name(record.model), name(record.manufacturer), name(record.kind)],
    [name(record.module_model), name(record.module_manufacturer), ''],
  ]) {
    if (!model) continue;
    const key = JSON.stringify([manufacturer, model, kind]);
    const item = models.get(key) || {manufacturer, model, kind, count: 0, url: modelWebsite(model, manufacturer, kind)};
    item.count++; models.set(key, item);
  }
}
const report = {
  records: records.length,
  manufacturer_groups: companies.size,
  model_groups: models.size,
  missing_manufacturers: [...companies.values()].filter(item => !item.url).sort((a, b) => b.count - a.count),
  missing_models: [...models.values()].filter(item => !item.url).sort((a, b) => b.count - a.count),
};
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({records: report.records, manufacturer_groups: companies.size,
  model_groups: models.size, missing_manufacturers: report.missing_manufacturers.length,
  missing_models: report.missing_models.length, ...(output ? {report: output} : {})}));
