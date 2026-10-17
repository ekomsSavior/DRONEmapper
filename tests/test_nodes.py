"""Isolated synthetic node validation. No fixture is saved to the map's runtime data."""
import copy
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from node_server import NodeStore, NodeCollector, make_server, validate_batch, MAX_AGE

NOW = 1792100000.
KEY = 'isolated-test-key-' + 'x'*32


def batch(now=NOW):
    return {'schema_version': 1, 'node_id': '00000000-0000-4000-8000-000000000001', 'observations': [{
        'event_id': '00000000-0000-4000-8000-000000000002', 'rid': b'TEST-ONLY'.ljust(20, b'\x00').hex(),
        'id_type': 1, 'aircraft_type': 2, 'protocol': 'ble', 'latitude': 37., 'longitude': -122.,
        'observed_at': now-10, 'received_at': now-9}]}


class NodeValidation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.nodes = NodeStore(Path(self.temp.name)/'test.sqlite3', KEY)

    def tearDown(self):
        self.nodes.close()
        self.temp.cleanup()

    def test_valid_position_keeps_original_time_and_unverified_identity(self):
        self.assertEqual(self.nodes.accept(batch(), NOW)['accepted'], 1)
        row = self.nodes.snapshot(now=NOW)[0]
        self.assertEqual(row['observed_at'], NOW-10)
        self.assertEqual(row['position_method'], 'remote-id-broadcast')
        self.assertEqual(row['purpose'], 'unknown')
        self.assertIsNone(row['operator'])
        self.assertTrue(row['live'])
        self.assertNotIn('rid', row)
        self.assertNotIn('node_id', row)
        stored = self.nodes.db.execute('SELECT record FROM observations').fetchone()[0]
        self.assertNotIn(batch()['observations'][0]['rid'], stored)

    def test_usb_nan_position_uses_original_observation_time(self):
        body = batch()
        body['observations'][0]['protocol'] = 'usb-wifi-nan'
        self.assertEqual(self.nodes.accept(body, NOW)['accepted'], 1)
        self.assertEqual(self.nodes.snapshot(now=NOW)[0]['observed_at'], NOW-10)

    def test_repeat_upload_is_idempotent_and_cannot_refresh_age(self):
        self.nodes.accept(batch(), NOW)
        self.assertEqual(self.nodes.accept(batch(), NOW+60)['duplicates'], 1)
        row = self.nodes.snapshot(now=NOW+121)[0]
        self.assertFalse(row['live'])
        self.assertEqual(len(row['trail']), 1)
        self.assertEqual(self.nodes.snapshot(now=NOW+MAX_AGE), [])

    def test_nodes_merge_same_broadcast_id_but_do_not_regress_time(self):
        self.nodes.accept(batch(), NOW)
        later = batch(NOW+10)
        later['node_id'] = str(uuid.uuid4())
        later['observations'][0]['longitude'] = -121.9
        self.nodes.accept(later, NOW+10)
        older = batch(NOW-10)
        older['observations'][0]['event_id'] = str(uuid.uuid4())
        self.nodes.accept(older, NOW+10)
        records = self.nodes.snapshot(now=NOW+10)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['longitude'], -121.9)
        self.assertEqual([p['observed_at'] for p in records[0]['trail']], [NOW-20, NOW-10, NOW])

    def test_invalid_coordinates_time_type_and_extra_private_fields_rejected(self):
        for field, value in [('latitude', 91), ('longitude', float('nan')), ('latitude', True),
                ('observed_at', NOW-901), ('observed_at', NOW+6), ('received_at', NOW-500),
                ('protocol', 'ssid-guess'), ('id_type', 0), ('aircraft_type', 16), ('rid', '0'*40),
                ('pilot_latitude', 37), ('receiver_location', {}), ('ssid', 'irrelevant'), ('model', 'guessed')]:
            with self.subTest(field=field, value=value):
                body = batch(); body['observations'][0][field] = value
                with self.assertRaises((ValueError, TypeError)):
                    self.nodes.accept(body, NOW)
        self.assertEqual(self.nodes.snapshot(now=NOW), [])

    def test_batch_is_atomic_when_one_record_is_invalid(self):
        body = batch()
        bad = copy.deepcopy(body['observations'][0]); bad['event_id'] = str(uuid.uuid4()); bad['latitude'] = 100
        body['observations'].append(bad)
        with self.assertRaises(ValueError): self.nodes.accept(body, NOW)
        self.assertEqual(self.nodes.snapshot(now=NOW), [])

    def test_feed_uses_node_data_without_requiring_external_collectors(self):
        collector = NodeCollector(self.temp.name, self.nodes, external=False)
        self.assertEqual(collector.snapshot(current=NOW)['tracks'], [])
        self.nodes.accept(batch(), NOW)
        feed = collector.snapshot(current=NOW)
        self.assertEqual(feed['node_test']['positions'], 1)
        self.assertEqual(feed['activity'], [])


class NodeHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.nodes = NodeStore(Path(cls.temp.name)/'http.sqlite3', KEY)
        cls.server = make_server(('127.0.0.1', 0), NodeCollector(cls.temp.name, cls.nodes, external=False), cls.nodes, KEY)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(); cls.nodes.close(); cls.temp.cleanup()

    def request(self, method='POST', path='/v1/observations', body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        connection.request(method, path, json.dumps(batch(time.time()) if body is None else body), headers or {})
        response = connection.getresponse(); result = response.status, json.loads(response.read()); connection.close(); return result

    def auth(self): return {'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json'}

    def test_auth_required(self): self.assertEqual(self.request()[0], 401)
    def test_wrong_key_rejected(self): self.assertEqual(self.request(headers={'Authorization':'Bearer wrong'})[0], 401)
    def test_browser_origin_rejected(self): self.assertEqual(self.request(headers={**self.auth(),'Origin':'http://other-site.test'})[0], 403)
    def test_json_content_type_required(self): self.assertEqual(self.request(headers={'Authorization':'Bearer '+KEY})[0], 415)
    def test_oversized_batch_rejected(self): self.assertEqual(self.request(body={'large':'x'*70000},headers=self.auth())[0], 413)
    def test_unknown_path_not_a_write_api(self): self.assertEqual(self.request(path='/feed',headers=self.auth())[0], 404)
    def test_authenticated_observation_reaches_feed(self):
        body=batch(time.time());body['observations'][0]['event_id']=str(uuid.uuid4())
        status, receipt=self.request(body=body, headers=self.auth());self.assertEqual(status,200);self.assertEqual(receipt['accepted'],1)
        status, feed=self.request(method='GET',path='/feed');self.assertEqual(status,200)
        self.assertGreaterEqual(len(feed['tracks']),1)
        self.assertNotIn(KEY,json.dumps(feed))
    def test_expired_record_rejected(self): self.assertEqual(self.request(body=batch(time.time()-1000),headers=self.auth())[0],422)


if __name__ == '__main__': unittest.main()
