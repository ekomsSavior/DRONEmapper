import csv
import io
import unittest
from oam_source import normalize_oam, fetch_oam
from avmap_source import FIELDS, replay, normalize
from voto_source import voto_datasets, normalize_voto, deduplicate_glider_positions, voto_position_url

NOW = 1792108800  # 2026-10-16 UTC

def survey(**changes):
    return {'_id': 'a'*24, 'platform': 'uav', 'title': 'Validation survey',
            'bbox': [10, 20, 10.01, 20.01], 'acquisition_start': '2026-10-14T00:00:00Z',
            'acquisition_end': '2026-10-14T01:00:00Z', **changes}

def catalog(rows):
    return {'meta': {'provided_by': 'OpenAerialMap', 'license': 'CC-BY 4.0', 'page': 1, 'limit': 100, 'found': len(rows)}, 'results': rows}

def events(rows):
    out = io.StringIO(); writer = csv.DictWriter(out, fieldnames=FIELDS); writer.writeheader()
    for row in rows:
        writer.writerow({'date': '2026-01-01', 'company': 'Validation company', 'city': 'Validation city', **row})
    return out.getvalue()

class WorldwideSources(unittest.TestCase):
    def test_survey_area_is_dated_not_aircraft_position(self):
        r = normalize_oam(catalog([survey()]), NOW)[0]
        self.assertEqual(r['record_type'], 'historical'); self.assertIsNone(r['observed_at'])
        self.assertIsNone(r['operator']); self.assertIsNone(r['model'])
        self.assertAlmostEqual(r['longitude'], 10.005)
        self.assertEqual(r['status'], 'historical-survey')

    def test_survey_excludes_satellites_unknown_dates_large_and_invalid_areas(self):
        for changes in [{'platform': 'satellite'}, {'platform': 'aircraft'}, {'acquisition_start': None},
                        {'acquisition_end': '2027-01-01T00:00:00Z'}, {'bbox': [10,20,70,30]},
                        {'bbox': [True,20,10.01,20.01]}, {'acquisition_start': '2023-01-01T00:00:00Z'}]:
            self.assertEqual(normalize_oam(catalog([survey(**changes)]), NOW), [])

    def test_incomplete_pages_do_not_replace_cached_data(self):
        p = catalog([survey()]); p['meta']['found'] = 101
        with self.assertRaises(ValueError): fetch_oam(NOW, lambda _: p)

    def test_service_replay_updates_only_named_field_and_excludes_ended(self):
        create = {'event_type': 'service_created', 'supervision': 'Autonomous', 'access': 'Public', 'geometry_file': '10,20'}
        rows = [create, {'date': '2026-02-01', 'event_type': 'supervision_updated', 'supervision': 'Autonomous', 'geometry_file': '80,30'}]
        r = normalize(events(rows), {}, '2026-10-15')[0]
        self.assertEqual(r['longitude'], 10); self.assertIsNone(r['observed_at'])
        self.assertEqual(r['record_dates'], '2026-02-01')
        self.assertEqual(replay(events(rows+[{'date':'2026-03-01','event_type':'service_ended'}]), '2026-10-15'), [])
        for change in [{'event_type':'service_announced'}, {'event_type':'service_testing'}, {'supervision':'Safety Driver'}, {'supervision':'Attendant'}, {'date':'2028-01-01'}]:
            self.assertEqual(replay(events([{**create, **change}]), '2026-10-15'), [])

    def test_glider_discovery_and_shared_identity(self):
        t = {'table': {'columnNames':['datasetID','title','maxTime'], 'rows': [['locations','','2026-10-15T23:00:00Z'], ['nrt_SEA055_M109','','2026-10-15T23:00:00Z']]}}
        self.assertEqual(voto_datasets(t, NOW), ['nrt_SEA055_M109'])
        self.assertIn('latitude_qc=1&longitude_qc=1', voto_position_url('nrt_SEA055_M109'))
        a = {'id':'glider:6801674','kind':'underwater','observed_at':NOW-900}
        b = {'id':'voto:6801674','wmo_id':'6801674','kind':'underwater','observed_at':NOW-300}
        self.assertEqual(deduplicate_glider_positions([a,b]), [b])

    def test_ended_service_history_survives_reopening_without_changing_original_area(self):
        launch={'event_type':'service_created','supervision':'Autonomous','access':'Public','geometry_file':'10,20'}
        end={'event_type':'service_ended','date':'2026-03-01','geometry_file':'80,30','source_url':'https://example.org/closure'}
        rows=[launch,end,end,{**launch,'date':'2026-04-01','geometry_file':'30,40'}]
        output=normalize(events(rows),{},'2026-10-20')
        historical=[r for r in output if r['record_type']=='historical']
        self.assertEqual(len(output),2);self.assertEqual(len(historical),1)
        h=historical[0]
        self.assertEqual(h['longitude'],10);self.assertEqual(h['status'],'historical-service')
        self.assertIsNone(h['observed_at']);self.assertEqual(h['record_dates'],'2026-01-01 — 2026-03-01')
        self.assertEqual(h['evidence_url'],'https://example.org/closure')
        self.assertEqual(normalize(events(rows),{},'2026-12-20'),output)
        self.assertEqual(normalize(events([launch,end]),{},'2026-02-01')[0]['record_type'],'activity')
        for change in [{'event_type':'service_announced'},{'event_type':'service_testing'},{'supervision':'Safety Driver'},{'access':'Private'}]:
            self.assertEqual(normalize(events([{**launch,**change},end]),{},'2026-10-20'),[])

    def test_history_needs_a_launch_and_starts_at_driverless_transition(self):
        launch={'event_type':'service_created','supervision':'Safety Driver','access':'Public','geometry_file':'10,20'}
        end={'event_type':'service_ended','date':'2026-03-01'}
        self.assertEqual(normalize(events([end]),{},'2026-10-20'),[])
        h=normalize(events([launch,{'event_type':'supervision_updated','date':'2026-02-01','supervision':'Autonomous'},end]),{},'2026-10-20')[0]
        self.assertEqual(h['service_started'],'2026-02-01')
        self.assertEqual(h['service_ended'],'2026-03-01')

    def test_glider_null_and_stale_reports_are_not_moved(self):
        meta = {'dataset_id':'nrt_SEA055_M109','wmo_id':'6801674','glider_serial':'SEA055','glider_name':'Validation'}
        t = {'table': {'columnNames':['time','latitude','longitude'], 'columnUnits':['UTC','degrees_north','degrees_east'], 'rows': [['2026-10-15T23:00:00Z',60,19],['2026-10-15T23:30:00Z',None,None],['2026-10-01T23:00:00Z',60,19]]}}
        r = normalize_voto(t,meta,NOW)[0]
        self.assertEqual(r['observed_at'], NOW-3600)
        self.assertEqual(r['position_method'], 'provider-estimated')
        t['table']['columnUnits'][1] = 'radians'
        with self.assertRaises(ValueError): normalize_voto(t,meta,NOW)
