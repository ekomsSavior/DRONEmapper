#!/usr/bin/env python3
"""Local Android-node test server. Does not deploy, publish or change production.

Original code: Church of Malware / saviorSEC, AGPL-3.0-or-later.
"""
import argparse
import hashlib
import hmac
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
from server import Collector, Handler, PUBLIC, ROOT

PROTOCOLS = {'ble', 'ble-coded', 'wifi-beacon', 'wifi-aware', 'usb-wifi-beacon','usb-wifi-nan'}
MAX_AGE = 900
MAX_BODY = 65536
RID = re.compile(r'^[a-f0-9]{40}$')
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
AIRFRAMES = {1: 'Aeroplane', 2: 'Helicopter / multirotor', 3: 'Gyroplane', 4: 'Hybrid lift',
             5: 'Ornithopter', 6: 'Glider', 7: 'Kite', 8: 'Free balloon', 9: 'Captive balloon',
             10: 'Airship', 11: 'Free-fall parachute', 12: 'Rocket', 13: 'Tethered powered aircraft',
             14: 'Ground obstacle'}


def number(value, lo, hi):
    return type(value) in (int, float) and math.isfinite(value) and lo <= value <= hi


def validate_batch(body, now):
    if not isinstance(body, dict) or set(body) != {'schema_version', 'node_id', 'observations'}:
        raise ValueError('Invalid envelope')
    if type(body['schema_version']) is not int or body['schema_version'] != 1:
        raise ValueError('Unsupported schema')
    if not isinstance(body['node_id'], str) or not UUID.fullmatch(body['node_id']):
        raise ValueError('Invalid node ID')
    records = body['observations']
    if not isinstance(records, list) or not 1 <= len(records) <= 50:
        raise ValueError('Expected 1–50 observations')
    required = {'event_id', 'rid', 'id_type', 'aircraft_type', 'protocol', 'latitude', 'longitude', 'observed_at', 'received_at'}
    optional = {'rssi_dbm': (-127, 20), 'altitude_m': (-999.5, 31767.5), 'speed_mps': (0, 254.25), 'heading': (0, 359)}
    seen = set()
    for record in records:
        if not isinstance(record, dict) or not required <= set(record) or set(record) - required - optional.keys():
            raise ValueError('Unexpected observation fields')
        event = record['event_id']
        if not isinstance(event, str) or not UUID.fullmatch(event) or event in seen:
            raise ValueError('Invalid / duplicate event ID')
        seen.add(event)
        if not isinstance(record['rid'], str) or not RID.fullmatch(record['rid']) or record['rid'] == '0'*40:
            raise ValueError('Invalid broadcast ID')
        if type(record['id_type']) is not int or record['id_type'] not in {1, 2, 3, 4}:
            raise ValueError('Invalid ID type')
        if type(record['aircraft_type']) is not int or not 0 <= record['aircraft_type'] <= 15:
            raise ValueError('Invalid airframe type')
        if record['protocol'] not in PROTOCOLS:
            raise ValueError('Unsupported transport')
        if not number(record['latitude'], -90, 90) or not number(record['longitude'], -180, 180) or (record['latitude'] == 0 and record['longitude'] == 0):
            raise ValueError('Invalid coordinates')
        if not number(record['observed_at'], now-MAX_AGE, now+5) or not number(record['received_at'], now-MAX_AGE, now+5):
            raise ValueError('Expired or future observation')
        if not -5 <= record['received_at']-record['observed_at'] <= 120:
            raise ValueError('Stale broadcast at reception')
        for key, bounds in optional.items():
            if key in record and not number(record[key], *bounds):
                raise ValueError('Invalid '+key)
    return records


class NodeStore:
    def __init__(self, path, secret):
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS observations (event TEXT PRIMARY KEY, track TEXT, stamp REAL, received REAL, record TEXT)')
        self.db.execute('CREATE INDEX IF NOT EXISTS track_time ON observations(track, stamp)')
        self.secret = secret.encode()

    def accept(self, body, now=None):
        now = time.time() if now is None else now
        records = validate_batch(body, now)
        accepted = 0
        with self.lock, self.db:
            self.db.execute('DELETE FROM observations WHERE stamp < ?', (now-MAX_AGE,))
            for raw in records:
                # Broadcast identifiers are unverified. Namespace by ID type, not by reporting node.
                identity = f"{raw['id_type']}:{raw['rid']}".encode()
                track_id = 'rid-' + hmac.new(self.secret, identity, hashlib.sha256).hexdigest()[:24]
                event_id = hmac.new(self.secret, (body['node_id']+raw['event_id']).encode(), hashlib.sha256).hexdigest()
                record = {'id': track_id, 'record_type': 'position', 'kind': 'drone', 'domain': 'air',
                    'name': 'Remote ID · '+track_id[-8:], 'model': None, 'manufacturer': None, 'operator': None,
                    'purpose': 'unknown', 'latitude': raw['latitude'], 'longitude': raw['longitude'],
                    'observed_at': raw['observed_at'], 'position_basis': 'reported', 'position_method': 'remote-id-broadcast',
                    'precision': 'Broadcast-reported; accuracy unverified', 'status': 'broadcast-reported',
                    'reported_airframe': AIRFRAMES.get(raw['aircraft_type'], 'Unknown'), 'protocol': raw['protocol']}
                for key in ('altitude_m', 'speed_mps', 'heading'):
                    if key in raw:
                        record[key] = raw[key]
                if 'altitude_m' in raw:
                    record['altitude_reference'] = 'WGS84 ellipsoid (broadcast)'
                # Never persist pilot position, receiver route, MAC, token or raw broadcast identifier.
                result = self.db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)',
                    (event_id, track_id, raw['observed_at'], raw['received_at'], json.dumps(record, allow_nan=False)))
                accepted += result.rowcount
            self.db.execute('DELETE FROM observations WHERE event NOT IN (SELECT event FROM observations ORDER BY stamp DESC LIMIT 10000)')
        return {'schema_version': 1, 'accepted': accepted, 'duplicates': len(records)-accepted}

    def snapshot(self, hours=24, now=None):
        now = time.time() if now is None else now
        with self.lock, self.db:
            self.db.execute('DELETE FROM observations WHERE stamp < ?', (now-MAX_AGE,))
            rows = self.db.execute('SELECT record FROM observations WHERE stamp >= ? ORDER BY stamp',
                                   (now-min(MAX_AGE, hours*3600),)).fetchall()
        tracks = {}
        for (serialized,) in rows:
            record = json.loads(serialized)
            previous = tracks.get(record['id'])
            trail = previous['trail'] if previous else []
            point = {key: record[key] for key in ('latitude', 'longitude', 'observed_at')}
            if not trail or point != trail[-1]:
                trail.append(point)
            record['trail'] = trail[-600:]
            record['live'] = 0 <= now-record['observed_at'] <= 120
            tracks[record['id']] = record
        return list(tracks.values())

    def close(self):
        with self.lock:
            self.db.close()


class NodeCollector(Collector):
    def __init__(self, directory, nodes, external=True):
        super().__init__(directory, adapters=None if external else {})
        self.nodes = nodes
        self.external = external
        if not external:
            self.providers = {}

    def snapshot(self, hours=24, current=None):
        snapshot = super().snapshot(hours, current)
        tracks = self.nodes.snapshot(hours, snapshot['server_time'])
        snapshot['tracks'].extend(tracks)
        snapshot['node_test'] = {'enabled': True, 'positions': len(tracks), 'retention_seconds': MAX_AGE}
        return snapshot


class NodeHandler(Handler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def do_POST(self):
        if urlsplit(self.path).path != '/v1/observations':
            return self.json(404, {'error': 'Not found'})
        credential = self.headers.get('Authorization', '')
        if not hmac.compare_digest(credential.encode(), ('Bearer '+self.server.node_key).encode()):
            return self.json(401, {'error': 'Invalid node key'})
        if self.headers.get('Origin') is not None:
            return self.json(403, {'error': 'Browser uploads are disabled'})
        now = time.time()
        with self.server.rate_lock:
            self.server.requests = [stamp for stamp in self.server.requests if now-stamp < 60]
            if len(self.server.requests) >= 120:
                return self.json(429, {'error': 'Slow down'})
            self.server.requests.append(now)
        if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
            return self.json(415, {'error': 'Send a fixed-length JSON body'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.json(400, {'error': 'Invalid content length'})
        if not 1 <= length <= MAX_BODY:
            return self.json(413, {'error': 'Body must be 1–65536 bytes'})
        try:
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('Incomplete body')
            body = json.loads(data, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
            receipt = self.server.nodes.accept(body, now)
        except (ValueError, TypeError, KeyError, UnicodeError):
            return self.json(422, {'error': 'Invalid or expired observation batch'})
        except TimeoutError:
            return self.json(408, {'error': 'Request timed out'})
        return self.json(200, receipt)


def make_server(address, collector, nodes, key):
    server = ThreadingHTTPServer(address, NodeHandler)
    server.daemon_threads = True
    server.collector, server.nodes, server.node_key = collector, nodes, key
    server.rate_lock, server.requests = threading.Lock(), []
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8782)
    parser.add_argument('--data-dir', type=Path, default=ROOT / '.node-data')
    parser.add_argument('--key-file', type=Path, help='Existing key; otherwise created in data directory')
    parser.add_argument('--external', action='store_true', help='Also run the existing worldwide collectors')
    args = parser.parse_args()
    try:
        host = ipaddress.ip_address(args.host)
        if host.version != 4 or not (host.is_private or host.is_loopback or host.is_unspecified):
            raise ValueError()
    except ValueError:
        parser.error('Use a local IPv4 address or 0.0.0.0 for a trusted LAN test')
    if args.data_dir.resolve().is_relative_to(PUBLIC):
        parser.error('Private node data must be outside public/')
    os.umask(0o077)
    args.data_dir.mkdir(parents=True, exist_ok=True)
    key_path = args.key_file or args.data_dir / 'node-key.txt'
    if key_path.resolve().is_relative_to(PUBLIC):
        parser.error('Node key must be outside public/')
    if not key_path.exists():
        key_path.write_text(secrets.token_urlsafe(32)+'\n')
    key = key_path.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', key):
        parser.error('Invalid key file')
    nodes = NodeStore(args.data_dir / 'observations.sqlite3', key)
    collector = NodeCollector(args.data_dir, nodes, args.external)
    server = make_server((args.host, args.port), collector, nodes, key)
    if args.external:
        threading.Thread(target=collector.run, daemon=True).start()
    print(f'LOCAL NODE TEST: http://{args.host}:{args.port}/', flush=True)
    print(f'Private node key file: {key_path.resolve()}', flush=True)
    print('No production connection. HTTP for trusted LAN / ADB testing only. Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        collector.stop.set()
        server.server_close()
        nodes.close()


if __name__ == '__main__':
    main()
