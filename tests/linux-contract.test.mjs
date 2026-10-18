import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateBatch,nodeRecord} from '../worker/node-records.mjs';

test('Linux-generated observations pass the production validator without private radio fields',()=>{
 const script=fileURLToPath(new URL('../linux-node/tests/contract_fixture.py',import.meta.url));
 const {now,batch}=JSON.parse(execFileSync('python3',[script],{encoding:'utf8'}));
 const rows=validateBatch(batch,now);assert.equal(rows.length,4);
 for(const row of rows){assert.equal(row.mac,undefined);assert.equal(row.ssid,undefined);assert.equal(row.source,undefined);}
 assert.equal(nodeRecord(rows.find(r=>r.rid),'test',now).position_basis,'reported');
 assert.equal(nodeRecord(rows.find(r=>r.observation_type==='wifi-candidate'),'test',now).position_basis,'receiver-area');
 assert.equal(nodeRecord(rows.find(r=>r.observation_type==='adsb-uas'),'test',now).position_method,'adsb-broadcast');
 assert.equal(nodeRecord(rows.find(r=>r.observation_type==='adsb-uas'),'test',now).manufacturer,null);
 assert.equal(nodeRecord(rows.find(r=>r.observation_type==='dji-droneid'),'test',now).model,'Mavic Air 2');
});
