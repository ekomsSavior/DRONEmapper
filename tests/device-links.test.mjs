import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {companyWebsite, modelWebsite} from '../public/company-links.mjs';
import {companyLinks, modelLinks} from '../public/device-link-data.mjs';

test('4AG manufacturer and harvester model link separately', () => {
  assert.equal(companyWebsite('4AG Robotics'), 'https://4ag.ai/');
  assert.equal(modelWebsite('4AG Mushroom Harvester', '4AG Robotics'), 'https://4ag.ai/harvesting-robot/');
});

test('whole-name matches tolerate case and whitespace, not guessed models or makers', () => {
  assert.equal(companyWebsite('  boston   DYNAMICS  '), 'https://bostondynamics.com/');
  assert.equal(modelWebsite('  sPot ', ' BOSTON  Dynamics '), 'https://bostondynamics.com/products/spot');
  assert.equal(modelWebsite('Spot Mini', 'Boston Dynamics'), null);
  assert.equal(modelWebsite('Spot', 'Another Company'), null);
  assert.equal(modelWebsite('Spot', ''), null);
  assert.equal(companyWebsite('4AG Robotics Distributor'), null);
  for (const value of [undefined, null, 123, {}, '', '<script>', 'https://untrusted.example']) {
    assert.equal(companyWebsite(value), null);
    assert.equal(modelWebsite(value, '4AG Robotics'), null);
  }
});

test('ambiguous unbranded model names require device context', () => {
  assert.equal(modelWebsite('APEX', '', 'profiling-float'), 'https://argo.ucsd.edu/how-do-floats-work/float-types/');
  assert.equal(modelWebsite('APEX', '', 'drone'), null);
  assert.equal(modelWebsite('APEX', ''), null);
  assert.equal(modelWebsite('APEX', 'Unrelated company', 'profiling-float'), null);
});

test('reviewed links are HTTPS, credential-free and uniquely keyed', () => {
  const seen = new Set();
  for (const [manufacturer, model, kind, url] of modelLinks) {
    assert.ok(model);
    assert.ok(manufacturer || kind, 'unbranded models must be scoped to device kind');
    const key = JSON.stringify([manufacturer, model, kind].map(v => v.trim().replace(/\s+/g, ' ').toLowerCase()));
    assert.ok(!seen.has(key), 'Duplicate model ' + key); seen.add(key);
    assert.equal(modelWebsite(model, manufacturer, kind), url);
  }
  const companyNames = Object.keys(companyLinks).map(v => v.trim().replace(/\s+/g, ' ').toLowerCase());
  assert.equal(new Set(companyNames).size, companyNames.length);
  for (const value of [...Object.values(companyLinks), ...modelLinks.map(v => v[3])]) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.ok(!url.hostname.includes('localhost'));
    assert.ok(!/[<>\s]/.test(value), value);
  }
});

test('browser directory stays in sync with reviewed catalog', () => {
  const catalog = JSON.parse(readFileSync(new URL('../docs/device-links.json', import.meta.url)));
  assert.deepEqual(companyLinks, Object.fromEntries(Object.entries(catalog.companies).map(([name, item]) => [name, item.url])));
  assert.deepEqual(modelLinks, catalog.models.map(item => [item.manufacturer, item.model, item.kind || '', item.url]));
});
