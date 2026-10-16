import test from 'node:test';import assert from 'node:assert/strict';
import {updateProfile,profileRecord,GHOST_AFTER} from '../worker/observation-profile.mjs';
test('all positioned vehicle types retain original sighting time and become ghosts after fourteen days',()=>{
 for(const kind of ['drone','robot-dog','surface-vessel','underwater','autonomous-vehicle']){
  const record={id:kind,kind,record_type:'position',observed_at:1000,latitude:30,longitude:20};
  let p=updateProfile(null,record);p=updateProfile(p,record);assert.equal(p.observations,1);
  assert.equal(profileRecord(p,1000+GHOST_AFTER-1).ghost,false);assert.equal(profileRecord(p,1000+GHOST_AFTER).ghost,true);
  p=updateProfile(p,{...record,observed_at:1000+GHOST_AFTER+10});assert.equal(p.observations,2);assert.equal(profileRecord(p,p.last_seen).ghost,false);assert.equal(p.first_seen,1000);
 }
 assert.equal(updateProfile(null,{record_type:'activity',observed_at:null}),null);
});
