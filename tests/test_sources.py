"""Isolated validation tests. No test records are loaded into the application."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from data_sources import normalize_adsb, normalize_deploy
from noaa_source import _position, DATASETS
from server import Collector, INTERVAL
from climateviewer_source import normalize_climateviewer

NOW=1792083540.0

class Sources(unittest.TestCase):
    def feature(self, **changes):
        prop={'slug':'unit-validation','modelName':'Validation robot','locationName':'Test location','formFactor':'quadruped','status':'operational','startYear':2025,'deploymentUrl':'/deployments/unit-validation'}
        prop.update(changes)
        return {'type':'Feature','properties':prop,'geometry':{'type':'Point','coordinates':[2,48]}}

    def test_activity_cannot_become_a_live_position(self):
        r=normalize_deploy({'features':[self.feature()]},NOW)[0]
        self.assertEqual(r['record_type'],'activity')
        self.assertIsNone(r['observed_at'])
        self.assertEqual(r['precision'],'Approximate deployment area')
        self.assertIsNone(r['operator'])
        self.assertEqual(r['purpose'],'unknown')

    def test_delivery_program_is_explicit_and_operator_not_assumed(self):
        f=self.feature(companySlug='wing',companyName='Wing',modelName='Wing Delivery Aircraft',formFactor='aerial')
        r=normalize_deploy({'features':[f]},NOW)[0]
        self.assertEqual(r['purpose'],'delivery')
        self.assertIsNone(r['operator'])
        f['properties']['operatorType']='maker_operated'
        self.assertEqual(normalize_deploy({'features':[f]},NOW)[0]['operator'],'Wing')
        f['properties'].update(companySlug='dji',modelName='Mavic 3',companyName='DJI',operatorType=None)
        r=normalize_deploy({'features':[f]},NOW)[0]
        self.assertEqual(r['purpose'],'unknown')
        self.assertIsNone(r['operator'])

    def test_no_infrastructure_or_announcements_or_future_deployments(self):
        features=[self.feature(formFactor='data_center'),self.feature(status='announced'),self.feature(startYear=2028),self.feature(modelName='AIR ONE',formFactor='aerial')]
        self.assertEqual(normalize_deploy({'features':features},NOW),[])

    def test_missing_coordinates_and_global_place_are_not_geolocated(self):
        bad=self.feature();bad['geometry']['coordinates']=[None,48]
        invalid=self.feature();invalid['geometry']['coordinates']=[0,0]
        self.assertEqual(normalize_deploy({'features':[bad,invalid,self.feature(locationName='Global')]},NOW),[])

    def aircraft(self, **changes):
        a={'hex':'abc123','t':'Q4','lat':36,'lon':-75,'seen_pos':30}
        a.update(changes)
        return {'now':NOW*1000,'ac':[a]}

    def test_uses_position_age_not_collection_time(self):
        r=normalize_adsb(self.aircraft(seen_pos=600),NOW)[0]
        self.assertEqual(r['observed_at'],NOW-600)

    def test_generic_aircraft_and_simulations_excluded(self):
        for updates in ({'t':'A320'},{'t':'Q5'},{'simulated':True},{'test_broadcast':True}):
            self.assertEqual(normalize_adsb(self.aircraft(**updates),NOW),[])

    def test_route_estimate_is_not_aircraft_position(self):
        j=self.aircraft();a=j['ac'][0];a.pop('lat');a.pop('lon');a.update(rr_lat=37,rr_lon=-78)
        self.assertEqual(normalize_adsb(j,NOW),[])

    def test_historical_position_does_not_inherit_current_motion(self):
        j=self.aircraft();a=j['ac'][0];a.pop('lat');a.pop('lon');a.update(lastPosition={'lat':36,'lon':-75,'seen_pos':300},alt_geom=50000,gs=150)
        r=normalize_adsb(j,NOW)[0]
        self.assertEqual(r['observed_at'],NOW-300)
        self.assertNotIn('altitude_m',r)
        self.assertNotIn('speed_mps',r)

    def test_invalid_age_or_nonfinite_data_rejected(self):
        for updates in ({'seen_pos':None},{'seen_pos':-1},{'lat':float('nan')},{'lon':True},{'seen_pos':90000}):
            self.assertEqual(normalize_adsb(self.aircraft(**updates),NOW),[])

    def test_noaa_stale_or_future_reports_excluded(self):
        payload={'table':{'columnNames':['time','latitude','longitude'],'columnUnits':['UTC','degrees_north','degrees_east'],'rows':[['2026-10-01T16:00:00Z',20,-65]]}}
        self.assertIsNone(_position(payload,DATASETS[0],NOW))
        payload['table']['rows'][0][0]='2026-10-16T16:00:00Z'
        self.assertIsNone(_position(payload,DATASETS[0],NOW))

    def test_noaa_units_must_match(self):
        with self.assertRaises(ValueError):
            _position({'table':{'columnNames':['time','latitude','longitude'],'columnUnits':['UTC','radians','radians'],'rows':[]}},DATASETS[0],NOW)

class Persistence(unittest.TestCase):
    def test_five_minute_cadence_and_failure_preserve_original_times(self):
        with tempfile.TemporaryDirectory() as path:
            collector=Collector(path,adapters={})
            record={'id':'validation','record_type':'position','observed_at':NOW-20,'latitude':30,'longitude':-40,'name':'Validation'}
            with patch('server.time.time',return_value=NOW):
                collector.collect_one('validation',lambda:[record.copy()])
            self.assertEqual(collector.providers['validation']['next_attempt'],NOW+300)
            self.assertEqual(INTERVAL,300)
            def fail():raise OSError('offline')
            with patch('server.time.time',return_value=NOW+301):
                collector.collect_one('validation',fail)
            snap=collector.snapshot(current=NOW+301)
            self.assertEqual(snap['tracks'][0]['observed_at'],NOW-20)
            self.assertFalse(snap['tracks'][0]['live'])
            self.assertEqual(snap['collection']['delayed'],1)
            reloaded=Collector(path,adapters={})
            self.assertEqual(reloaded.snapshot(current=NOW+301)['tracks'][0]['observed_at'],NOW-20)

    def test_sources_are_not_exposed_in_main_feed(self):
        with tempfile.TemporaryDirectory() as path:
            c=Collector(path,adapters={})
            c.providers={'unit':{'records':[{'id':'one','name':'Validation','record_type':'activity','source':'internal','source_url':'https://example.org','evidence_url':'https://example.org'}]}}
            r=c.snapshot(current=NOW)['activity'][0]
            self.assertFalse({'source','source_url','evidence_url'}&r.keys())

    def test_refresh_deduplicates_same_measurement(self):
        with tempfile.TemporaryDirectory() as path:
            c=Collector(path,adapters={})
            r={'id':'validation','record_type':'position','observed_at':NOW-20,'latitude':30,'longitude':-40,'name':'Validation'}
            for offset in (0,301):
                with patch('server.time.time',return_value=NOW+offset):c.collect_one('unit',lambda:[r.copy()])
            self.assertEqual(len(c.providers['unit']['records'][0]['trail']),1)

class Historical(unittest.TestCase):
    def feature(self, description):
        return {'properties':{'name':'Validation Police Department','description':description},
                'geometry':{'type':'Point','coordinates':[-90,40]}}

    def test_authorization_keeps_historical_dates_and_never_becomes_position(self):
        text = '<b>Governmental Body/Entity:</b> Validation Police Department<br><b>Type of Drone:</b> Test model<p>Status: Active</p>General Location of Drone Activity: Validation city<p>Stated objective/purpose of COA: Training</p>Effective Dates: 2011-2012<p>Comments: Old authorization</p>'
        record=normalize_climateviewer({'features':[self.feature(text)]},NOW)[0]
        self.assertEqual(record['record_type'],'historical')
        self.assertIsNone(record['observed_at'])
        self.assertEqual(record['model'],'Test model')
        self.assertEqual(record['record_dates'],'2011-2012')
        self.assertEqual(record['purpose'],'public-safety')
        self.assertEqual(record['archive_year'],2018)

    def test_reference_pins_and_future_bases_are_excluded(self):
        descriptions=['<p>Active</p>', 'Know your drones',
                      'Service Branch: Army<br>Types of UAS: Raven<br>UAS Activities Status: Future']
        self.assertEqual(normalize_climateviewer({'features':[self.feature(d) for d in descriptions]},NOW),[])

    def test_old_current_base_is_only_historical(self):
        text='Service Branch: Army<br>Types of UAS: Raven<br>UAS Activities Status: Current'
        r=normalize_climateviewer({'features':[self.feature(text)]},NOW)[0]
        self.assertEqual(r['status'],'historical-base')
        self.assertEqual(r['record_type'],'historical')
        self.assertEqual(r['license'],'CC BY-NC-SA 4.0')

class Scheduling(unittest.TestCase):
    def test_deadline_jitter_does_not_skip_five_minutes(self):
        with tempfile.TemporaryDirectory() as path:
            c=Collector(path,adapters={'unit':lambda:[]})
            c.providers={'unit':{'next_attempt':NOW+0.01}}
            def wait(delay):
                self.assertLessEqual(delay,1)
                c.stop.set()
            with patch.object(c,'cycle'), patch.object(c.stop,'wait',side_effect=wait), patch('server.time.time',return_value=NOW):
                c.run()

if __name__=='__main__':unittest.main()
