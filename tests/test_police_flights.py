import copy
import json
from pathlib import Path
import tempfile
import unittest
from police_flights import normalize_sfpd, fetch_sfpd, SFPD_META
from server import Collector

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/sfpd-flight-logs.json').read_text())
TODAY = '2026-10-21'

class PoliceFlightTests(unittest.TestCase):
    def rows(self):
        return copy.deepcopy(FIXTURE['rows'])

    def test_dated_area(self):
        r = normalize_sfpd(self.rows(), TODAY)[0]
        self.assertEqual((r['record_type'], r['observed_at']), ('historical', None))
        self.assertEqual((r['event_date'], r['publication_date']), ('2026-04-07', '2026-09-25'))
        self.assertEqual(r['reported_duration_minutes'], 3)
        self.assertEqual((r['latitude'], r['longitude']), (37.773864, -122.405301))
        self.assertIsNone(r['model'])

    def test_rejects_invalid_places_dates(self):
        for patch in [dict(point=None), dict(date='2026-02-30'), dict(date='2027-01-01'), dict(point={'type':'Point','coordinates':[37.7,-122.4]}), dict(point={'type':'Point','coordinates':['-122.4',37.7]}), dict(point={'type':'Point','coordinates':[-122.4,True]})]:
            self.assertEqual(normalize_sfpd([{**self.rows()[0], **patch}], TODAY), [])

    def test_privacy_and_identity(self):
        row = {**self.rows()[0], 'reason_for_flight':'private narrative', 'case_cad_event_number':'private', 'user_email':'private', 'flight_duration_minutes':True}
        r = normalize_sfpd([row], TODAY)[0]
        self.assertNotIn('private', json.dumps(r))
        self.assertEqual(r['flight_purpose'], 'Other / unspecified')
        self.assertIsNone(r['reported_duration_minutes'])
        self.assertEqual(len(normalize_sfpd([row, {**row, 'source_row_id':'another'}], TODAY)), 2)
        with self.assertRaises(ValueError):
            normalize_sfpd([row, row], TODAY)

    def test_opaque_row_identifier(self):
        for identifier in ['row-a~bc.d-efgh', 'row-a!bc.d-efgh', 'row-a_bc.d-efgh']:
            row = {**self.rows()[0], 'source_row_id':identifier}
            self.assertEqual(normalize_sfpd([row], TODAY)[0]['id'], 'sfpd-flight:' + identifier)
        for identifier in ['', None, 42, 'has space', 'x'*201, ' a', 'a\n']:
            with self.assertRaises(ValueError):
                normalize_sfpd([{**self.rows()[0], 'source_row_id':identifier}], TODAY)

    def test_real_published_identifiers(self):
        rows = json.loads((Path(__file__).parent / 'fixtures/sfpd-opaque-ids.json').read_text())
        records = normalize_sfpd(rows, TODAY)
        self.assertEqual(len(records), 3)
        self.assertEqual([r['id'] for r in records], ['sfpd-flight:' + r['source_row_id'] for r in rows])

    def test_fetch_and_revision(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return FIXTURE['metadata'] if url == SFPD_META else self.rows()
        self.assertEqual(len(fetch_sfpd(fetch)), 2)
        self.assertEqual(calls[0], calls[-1])
        self.assertNotIn('case_cad', calls[1])
        def changed(url):
            if url == SFPD_META:
                return {**FIXTURE['metadata'], 'licenseId':'changed'}
            return self.rows()
        with self.assertRaises(ValueError):
            fetch_sfpd(changed)

    def test_failed_collection_preserves_previous_history(self):
        with tempfile.TemporaryDirectory() as d:
            c = Collector(Path(d), adapters={})
            c.collect_one('sfpd', lambda: normalize_sfpd(self.rows(), TODAY))
            old = copy.deepcopy(c.providers['sfpd']['records'])
            self.assertGreaterEqual(c.providers['sfpd']['next_attempt']-c.providers['sfpd']['last_attempt'], 3600)
            c.providers['sfpd']['next_attempt'] = 0
            def failed():
                raise ValueError('Incomplete page')
            c.collect_one('sfpd', failed)
            self.assertEqual(c.providers['sfpd']['records'], old)
            snap = c.snapshot()
            self.assertEqual(len(snap['activity']), 2)
            self.assertEqual(snap['tracks'], [])

if __name__ == '__main__':
    unittest.main()
