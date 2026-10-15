import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOAM,fetchOAM} from '../worker/oam-source.mjs';
import {replay,normalize,parseCSV} from '../worker/avmap-source.mjs';
import {votoDatasets,normalizeVoto,deduplicateGliderPositions,votoPositionUrl} from '../worker/voto-source.mjs';
const NOW=1792108800;
const survey=p=>({_id:'a'.repeat(24),platform:'uav',title:'Validation survey',bbox:[10,20,10.01,20.01],acquisition_start:'2026-10-14T00:00:00Z',acquisition_end:'2026-10-14T01:00:00Z',...p});
const catalog=rows=>({meta:{provided_by:'OpenAerialMap',license:'CC-BY 4.0',page:1,limit:100,found:rows.length},results:rows});
test('survey footprints remain historical; satellites, old/future dates and invalid areas excluded',()=>{
 const [r]=normalizeOAM(catalog([survey()]),NOW);assert.equal(r.record_type,'historical');assert.equal(r.observed_at,null);assert.equal(r.model,null);assert.equal(r.operator,null);
 for(const p of [{platform:'satellite'},{platform:'aircraft'},{acquisition_start:null},{acquisition_end:'2027-01-01T00:00:00Z'},{bbox:[10,20,70,30]},{bbox:[true,20,10.01,20.01]},{acquisition_start:'2023-01-01T00:00:00Z'}])assert.deepEqual(normalizeOAM(catalog([survey(p)]),NOW),[]);
});
test('incomplete catalog pagination fails instead of replacing good cached data',async()=>{const p=catalog([survey()]);p.meta.found=101;await assert.rejects(fetchOAM(async()=>p,NOW));});
const fields='date,event_type,company,city,geometry_file,vehicles,platform,fares,direct_booking,service_model,supervision,access,fleet_partner,expected_launch,company_link,booking_platform_link,source_url,notes'.split(',');
const csv=rows=>[fields.join(','),...rows.map(row=>fields.map(k=>'"'+String(({date:'2026-01-01',company:'Validation company',city:'Validation city',...row})[k]??'').replaceAll('"','""')+'"').join(','))].join('\n');
test('service replay changes named field only and rejects ended, announced and supervised services',()=>{
 const create={event_type:'service_created',supervision:'Autonomous',access:'Public',geometry_file:'10,20'},rows=[create,{date:'2026-02-01',event_type:'supervision_updated',supervision:'Autonomous',geometry_file:'80,30'}];
 const [r]=normalize(csv(rows),{},'2026-10-15');assert.equal(r.longitude,10);assert.equal(r.observed_at,null);assert.equal(r.record_dates,'2026-02-01');assert.deepEqual(replay(csv([...rows,{date:'2026-03-01',event_type:'service_ended'}]),'2026-10-15'),[]);
 for(const change of [{event_type:'service_announced'},{event_type:'service_testing'},{supervision:'Safety Driver'},{supervision:'Attendant'},{date:'2028-01-01'}])assert.deepEqual(replay(csv([{...create,...change}]),'2026-10-15'),[]);
 assert.throws(()=>parseCSV('different,schema\nx,y'));assert.equal(parseCSV(csv([{city:'Area, "quoted"\nsecond line'}]))[0].city,'Area, "quoted"\nsecond line');
});
test('glider discovery ignores web statistics; shared WMO keeps newest position',()=>{
 assert.deepEqual(votoDatasets({table:{columnNames:['datasetID','title','maxTime'],rows:[['locations','','2026-10-15T23:00:00Z'],['nrt_SEA055_M109','','2026-10-15T23:00:00Z']]}},NOW),['nrt_SEA055_M109']);
 assert.ok(votoPositionUrl('nrt_SEA055_M109').includes('latitude_qc=1&longitude_qc=1'));
 const a={id:'glider:6801674',kind:'underwater',observed_at:NOW-900},b={id:'voto:6801674',wmo_id:'6801674',kind:'underwater',observed_at:NOW-300};assert.deepEqual(deduplicateGliderPositions([a,b]),[b]);
});
test('provider-estimated glider positions retain original time; null, stale and wrong-unit reports rejected',()=>{
 const meta={dataset_id:'nrt_SEA055_M109',wmo_id:'6801674',glider_serial:'SEA055',glider_name:'Validation'},t={table:{columnNames:['time','latitude','longitude'],columnUnits:['UTC','degrees_north','degrees_east'],rows:[['2026-10-15T23:00:00Z',60,19],['2026-10-15T23:30:00Z',null,null],['2026-10-01T23:00:00Z',60,19]]}};
 const [r]=normalizeVoto(t,meta,NOW);assert.equal(r.observed_at,NOW-3600);assert.equal(r.position_method,'provider-estimated');t.table.columnUnits[1]='radians';assert.throws(()=>normalizeVoto(t,meta,NOW));
});
