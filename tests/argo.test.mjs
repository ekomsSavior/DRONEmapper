import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArgo,argoUrl,ARGO_COLUMNS} from '../worker/argo-source.mjs';
const now=Date.parse('2026-10-16T12:00:00Z')/1000;
const row=()=>['1900001','APEX','2026-10-16T10:00:00Z','2026-10-16T10:15:00Z',-40,80,'1','1','GPS'];
const payload=rows=>({table:{columnNames:ARGO_COLUMNS,columnUnits:[null,null,'UTC','UTC','degrees_north','degrees_east',null,null,null],rows}});
test('Argo uses the position timestamp and newest surface fix per float',()=>{
 const early=row();early[3]='2026-10-16T09:00:00Z';
 const records=normalizeArgo(payload([early,row(),row()]),now);
 assert.equal(records.length,1);
 assert.equal(records[0].observed_at,Date.parse(row()[3])/1000);
 assert.equal(records[0].kind,'profiling-float');
 assert.equal(records[0].manufacturer,null);
 assert.match(records[0].precision,/underwater position unknown/);
 assert.match(argoUrl(now),/time%3E=2026-10-15T12:00:00Z/);
});
test('Argo excludes bad, interpolated, stale, future and nonfinite observations',()=>{
 for(const [index,value] of [[6,'8'],[6,'2'],[7,'0'],[8,'UNKNOWN'],[3,null],[3,'2026-10-17T00:00:00Z'],[3,'2026-10-14T12:00:00Z'],[2,'2026-10-17T00:00:00Z'],[4,NaN],[5,181],[0,'invalid']]){
  const r=row();r[index]=value;assert.deepEqual(normalizeArgo(payload([r]),now),[],String([index,value]));
 }
});
test('Argo fails closed on table schema changes',()=>{
 const p=payload([row()]);p.table.columnUnits[4]='radians';
 assert.throws(()=>normalizeArgo(p,now));
 assert.throws(()=>normalizeArgo(payload([row().slice(1)]),now));
});
