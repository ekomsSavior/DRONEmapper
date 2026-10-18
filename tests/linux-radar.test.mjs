import test from 'node:test';
import assert from 'node:assert/strict';
import {contactPoint} from '../linux-node/dronemapper_node/static/radar.js';

test('reported positions use true bearings and stay inside the radar',()=>{
 const north=contactPoint({bearing:0,distance_m:1000},'positions',2000);
 const east=contactPoint({bearing:90,distance_m:1000},'positions',2000);
 assert.equal(north.x,250);assert.equal(north.y,149);
 assert.equal(east.x,351);assert.equal(east.y,250);
 const far=contactPoint({bearing:225,distance_m:100000},'positions',2000);
 assert.ok(Math.hypot(far.x-250,far.y-250)<=202.001);assert.equal(far.outside,true);
});
test('unknown position is not invented; signals fit inside the disc',()=>{
 assert.equal(contactPoint({key:'test',rssi_dbm:-40},'positions'),null);
 for(let i=0;i<500;i++){
  const p=contactPoint({key:String(i),rssi_dbm:-20-i},'signals');
  assert.ok(Math.hypot(p.x-250,p.y-250)<=200.001);
 }
});
test('range changes the GPS scale without changing signal-only placement',()=>{
 const contact={key:'test',bearing:90,distance_m:500,rssi_dbm:-60};
 for(const range of [500,2000,10000,500000]){
  const point=contactPoint(contact,'positions',range);
  assert.equal(point.x,250+500/range*202);
  assert.equal(point.y,250);
  assert.equal(point.outside,false);
  assert.deepEqual(contactPoint(contact,'signals',range),contactPoint(contact,'signals',2000));
 }
 assert.equal(contactPoint(contact,'positions',100).outside,true);
 for(const invalid of [0,-1,NaN,Infinity]){
  assert.deepEqual(contactPoint(contact,'positions',invalid),contactPoint(contact,'positions',2000));
 }
 assert.equal(contactPoint({...contact,distance_m:-1},'positions'),null);
});
