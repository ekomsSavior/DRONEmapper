import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dronePlatform,dronePlatforms} from '../public/drone-platforms.mjs';
import {dronePlatform as desktopPlatform} from '../linux-node/dronemapper_node/static/drone-platforms.mjs';
import {historicalMilestones} from '../worker/reviewed-history.mjs';

test('reviewed model context agrees across scanners and map', () => {
  assert.deepEqual(dronePlatforms, JSON.parse(readFileSync(new URL('../integration/drone-platforms.json',import.meta.url))));
  assert.deepEqual(dronePlatforms, JSON.parse(readFileSync(new URL('../android-node/app/src/main/assets/drone-platforms.json',import.meta.url))));
  for (const model of dronePlatforms.models) for (const alias of model.aliases) {
    assert.equal(dronePlatform(' Skydio ',alias)?.id,model.id);
    assert.deepEqual(dronePlatform('Skydio',alias),desktopPlatform('Skydio',alias));
    assert.equal('operator' in model,false);
    assert.equal('latitude' in model,false);
  }
});

test('namesakes, unsupported variants, modules and unknown devices never imply Fusus', () => {
  for (const [maker,model,kind] of [['Other','X10','drone'],['','X10','drone'],['Skydio','X10D','drone'],
    ['Skydio','X2D','drone'],['Skydio','2+ SDR35V1','drone'],['Skydio','X10 test','drone'],
    ['Skydio','R10','module'],['Skydio','X10','unknown'],['Skydio',null,'drone']])
    assert.equal(dronePlatform(maker,model,kind),null);
  assert.equal(dronePlatform(' SKYDIO, INC. ',' x10e   sr47p ')?.id,'skydio-x10');
});

test('documented programs retain publication dates, broad areas and no live position', () => {
  const ids=['miami-beach-axon-x10-2024','forsyth-fusus-drone-2024','oakland-dedrone-axon-2024'];
  for (const id of ids) {
    const record=historicalMilestones.find(x=>x.id==='milestone:'+id);
    assert.ok(record);assert.equal(record.record_dates,'2024-06-20');
    assert.equal(record.record_type,'historical');assert.equal(record.observed_at,null);
    assert.equal(record.position_basis,'reported-area');
  }
});
