#!/usr/bin/env python3
"""DRONE MAPPER external-data web server. AGPL-3.0-or-later.

Collects public data every five minutes. Browser users need no tools or accounts.
No radio capture, receiver enrollment, ingestion endpoint or generated records.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import html
import json
import mimetypes
import os
from pathlib import Path
import threading
import time
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit
from data_sources import fetch_json, normalize_deploy, normalize_adsb, DEPLOY_URL, ADSB_URL, finite
from reviewed_history import fetch_history
from climateviewer_source import fetch_climateviewer
from argo_source import fetch_argo
from ioos_source import fetch_ioos
from additional_sources import fetch_atlas, fetch_gliders
from police_flights import fetch_sfpd, SFPD_REFRESH
from agency_flights import AGENCIES, fetch_agency_flights
from oam_source import fetch_oam
from avmap_source import fetch_avmap
from voto_source import fetch_voto, deduplicate_glider_positions
from build_review import build_archive

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
INTERVAL = 300
RETENTION = 86400


def public_record(record):
    return {k: v for k, v in record.items() if k not in {'source', 'source_url', 'evidence_url', 'verification', 'purpose_evidence_url', 'attribution', 'license', 'license_url'}}


class Collector:
    def __init__(self, directory, adapters=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'external-cache.json'
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.running = False
        self.providers = {}
        if self.path.exists():
            try:
                self.providers = json.loads(self.path.read_text())['providers']
            except (ValueError, KeyError, OSError):
                pass
        self.adapters = adapters if adapters is not None else {
            'deploy': lambda: normalize_deploy(fetch_json(DEPLOY_URL)),
            'adsb': lambda: normalize_adsb(fetch_json(ADSB_URL)),
            'climateviewer': fetch_climateviewer, 'milestones': fetch_history,
            'sfpd': fetch_sfpd, 'ioos': fetch_ioos, 'argo': fetch_argo, 'atlas': fetch_atlas, 'gliders': fetch_gliders, 'oam': fetch_oam, 'avmap': fetch_avmap, 'voto': fetch_voto}
        if adapters is None:
            self.adapters.update({'police-'+a['id']: (lambda previous, agency=a: fetch_agency_flights(agency, previous)) for a in AGENCIES})
            try:
                from noaa_source import fetch_noaa
                self.adapters['noaa'] = fetch_noaa
            except ImportError:
                pass

    def save(self):
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'providers': self.providers}, allow_nan=False))
        temporary.replace(self.path)

    def collect_one(self, key, adapter):
        now = time.time()
        with self.lock:
            previous = self.providers.get(key, {})
            if previous.get('next_attempt', 0) > now:
                return
            self.providers[key] = {**previous, 'last_attempt': now, 'collecting': True}
        try:
            result = adapter(previous) if key.startswith('police-') else adapter()
            details = result if isinstance(result, dict) else {}
            records = details.get('records') if details else result
            if not isinstance(records, list):
                raise ValueError('Adapter must return records')
            # Validate adapter output at the persistence boundary too.
            for record in records:
                if not finite(record.get('latitude'), -90, 90) or not finite(record.get('longitude'), -180, 180):
                    raise ValueError('Invalid record coordinates')
                if record.get('record_type') not in {'activity', 'position', 'historical'}:
                    raise ValueError('Invalid record type')
                if record.get('record_type') == 'position':
                    stamp = record.get('observed_at')
                    if not isinstance(stamp, (float, int)) or not now-RETENTION <= stamp <= time.time()+5:
                        raise ValueError('Invalid observation time')
            with self.lock:
                # Retain measured positions, with original times, for up to 24h.
                retained = {r['id']: r for r in previous.get('records', [])
                            if r.get('record_type') == 'position' and now-r.get('observed_at', 0) < RETENTION}
                output = []
                for record in records:
                    if record['record_type'] == 'position':
                        old = retained.pop(record['id'], None)
                        if old and old['observed_at'] > record['observed_at']:
                            output.append(old)
                            continue
                        trail = list(old.get('trail', [])) if old else []
                        point = {k: record[k] for k in ('latitude', 'longitude', 'observed_at')}
                        if not trail or trail[-1]['observed_at'] != point['observed_at']:
                            trail.append(point)
                        record['trail'] = [p for p in trail if now-p['observed_at'] < RETENTION][-600:]
                    output.append(record)
                output.extend(retained.values())
                self.providers[key] = {'records': output, 'last_attempt': now, 'last_success': time.time(),
                                       'next_attempt': now+max(INTERVAL, details.get('refresh_after', SFPD_REFRESH if key == 'sfpd' else INTERVAL)), 'error': None, 'collecting': False,
                                       'source_revision': details.get('source_revision'), 'coverage': details.get('coverage')}
                self.save()
                print(json.dumps({'source': key, 'records': len(output), 'collected_at': time.time()}), flush=True)
        except Exception as error:
            retry = INTERVAL
            if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                try:
                    retry = max(INTERVAL, min(86400, int(error.headers.get('Retry-After', INTERVAL))))
                except (ValueError, TypeError):
                    pass
            with self.lock:
                self.providers[key] = {**previous, 'last_attempt': now, 'next_attempt': now+retry,
                                       'error': type(error).__name__, 'collecting': False}
                self.save()
            print(json.dumps({'source': key, 'error': type(error).__name__, 'retry_seconds': retry}), flush=True)

    def cycle(self):
        with self.lock:
            self.running = True
        try:
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(self.collect_one, k, fn) for k, fn in self.adapters.items()]
                for future in futures:
                    future.result()
        finally:
            with self.lock:
                self.running = False

    def run(self):
        while not self.stop.is_set():
            self.cycle()
            # Wake at the next provider deadline. A fixed tick can otherwise
            # skip an entire cycle when worker scheduling differs by milliseconds.
            with self.lock:
                deadlines = [p.get('next_attempt', time.time()+INTERVAL)
                             for k,p in self.providers.items() if k in self.adapters]
            delay = min(deadlines)-time.time() if deadlines else INTERVAL
            self.stop.wait(max(1, min(INTERVAL, delay)))

    def snapshot(self, hours=0, current=None):
        current = time.time() if current is None else current
        window = min(hours*3600, RETENTION) if hours else RETENTION
        with self.lock:
            activity, tracks = [], []
            for state in self.providers.values():
                for record in state.get('records', []):
                    if record['record_type'] == 'position':
                        if 0 <= current-record['observed_at'] <= window:
                            item = public_record(record)
                            item['live'] = 0 <= current-record['observed_at'] <= 120
                            tracks.append(item)
                    else:
                        activity.append(public_record(record))
            success = [p['last_success'] for p in self.providers.values() if p.get('last_success')]
            attempts = [p['next_attempt'] for p in self.providers.values() if p.get('next_attempt')]
            return {'schema_version': 2, 'server_time': current, 'tracks': deduplicate_glider_positions(tracks), 'activity': activity,
                    'collection': {'interval_seconds': INTERVAL, 'collecting': self.running,
                                   'last_success': max(success) if success else None,
                                   'next_update': min(attempts) if attempts else current,
                                   'available': sum(bool(p.get('last_success')) for p in self.providers.values()),
                                   'total': len(self.adapters), 'delayed': sum(bool(p.get('error')) for p in self.providers.values())}}

    def credits(self):
        with self.lock:
            items = {r['evidence_url']: r['name'] for p in self.providers.values() for r in p.get('records', [])
                     if r.get('source') == 'deploy' and r.get('evidence_url')}
        links = ''.join('<li><a href="'+html.escape(url, quote=True)+'">'+html.escape(name)+'</a></li>' for url,name in sorted(items.items()))
        return ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Credits — DRONE MAPPER</title>'
                '<link rel="stylesheet" href="style.css"><main class="legal-page"><a href="/">← Map</a><h1>Credits & licenses</h1>'
                '<p>DRONE MAPPER original code: <a href="LICENSE.txt">AGPL-3.0-or-later</a>. <a href="source.zip">Download source</a>.</p>'
                '<p>Map: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Leaflet: BSD-2-Clause.</p>'
                '<p>Aircraft positions: <a href="https://www.adsb.lol/docs/open-data/api/">ADSB.lol</a>, '
                '<a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. Filtered to identified unmanned type families, '
                'normalized and time-limited. <a href="data/aircraft.json">Download the attributed aircraft subset</a>.</p>'
                '<p>Published deployment facts: <a href="https://registry.deploy.report/terms">DEPLOY</a>. Filtered to robotic systems; '
                'locations are treated as approximate. Original editorial descriptions and images are not reproduced. '
                'Third-party data is governed by its own terms, separately from our software license.</p>'
                '<p>Historical operational milestones: Church of Malware / saviorSEC factual review, with dated operator evidence in <a href="/data/milestones.json">the milestone export</a>. Approximate areas are not current vehicle positions.</p>'
                '<p>Historical UAV layer: <a href="https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/">Jim Lee / ClimateViewer</a>, '
                '<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. Adapted: structured records filtered, '
                'fields normalized, reference and planned-location pins excluded. The 2018 archive is historical, not current activity. '
                '<a href="data/history.json">Download the adapted historical layer under the same license</a>. '
                'The noncommercial restriction applies to this data, not our AGPL software.</p>'
                '<p>Ocean vehicle measurements: NOAA AOML / PMEL and contributing operators. Dataset-specific credit and '
                'license details are included in <a href="data/ocean.json">the ocean measurement export</a>.</p>'
                '<p>Published police flight logs: <a href="https://data.sf.gov/d/giw5-ttjs">City and County of San Francisco / SFPD</a>, <a href="https://opendatacommons.org/licenses/pddl/1.0/">PDDL 1.0</a>. Adapted dates, durations, broad mission categories and generalized operation areas. SFPD publishes monthly and is checked hourly. Other agency-published flight dashboards are checked every 5–60 minutes according to the reviewed registry. Their factual dates, mission categories and generalized flight envelopes retain agency attribution; no additional open-data license is claimed. Missing or conflicting locations are omitted. No aircraft identity or live position is inferred. <a href="/data/police-flights.json">Attributed flight-log export</a> · <a href="/police-flights.html">Official flight-history portals</a>.</p>'
                '<p>Documented public-safety drone programs: <a href="https://www.atlasofsurveillance.org/atlas">Electronic Frontier Foundation / Atlas of Surveillance</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Adapted by selecting drone-program records and approximate agency areas, omitting ambiguous planning records and editorial summaries. Continued operation is unverified. <a href="/data/programs.json">Attributed program export</a>.</p><p>Reported underwater glider locations: <a href="https://cwcgom.aoml.noaa.gov/erddap/info/GLIDERS_LAST_10_DAYS_LOCATIONS/index.html">NOAA AOML CoastWatch and contributing operators</a>. The provider permits free use and redistribution without warranty. Positioning method is unspecified; reports older than 24 hours are omitted. <a href="/data/gliders.json">Attributed glider export and terms</a>.</p>'
                '<p>Documented driverless service areas: <a href="https://github.com/path-avmap/av-map-data">AV Map</a>, <a href="/licenses/av-map.txt">MIT license, copyright Jackson Lester</a>. Adapted by replaying dated service events and filtering for launched autonomous services. Ended driverless services are retained as dated history. City points and boundary centers are approximate areas, not vehicle positions. <a href="/data/driverless.json">Attributed service-area export</a>.</p><p>Dated UAV survey footprints: <a href="https://openaerialmap.org/">OpenAerialMap / Open Imagery Network contributors</a>, <a href="https://openaerialmap.org/legal/">CC BY 4.0</a>. Adapted metadata for contributor-labeled UAV imagery captured within the last 365 days; only footprint centers and factual capture dates are mapped. Per-record provider credits are retained in <a href="/data/surveys.json">the attributed survey export</a>. Imagery records are not flight counts.</p><p>Autonomous profiling floats: <a href="https://argo.ucsd.edu/">International Argo Program and contributing national programs</a>, part of the Global Ocean Observing System; Argo GDAC via Ifremer. <a href="https://doi.org/10.17882/42182">Dataset DOI</a> · <a href="https://argo.ucsd.edu/data/acknowledging-argo/">Unrestricted data use; attribution requested</a>. Only good-quality surface fixes within 24 hours enter collection; profiles retain their original observation times. These are drifting, vertically profiling robots, not powered navigation tracks. <a href="/data/floats.json">Attributed float export</a>.</p><p>Spray underwater gliders: <a href="https://gliders.ioos.us/">IOOS Glider DAC</a>, Scripps Institution of Oceanography and Woods Hole Oceanographic Institution; <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Adapted surface GPS subset; only passing provider quality flags and fixes within 24 hours enter collection. Surface fixes are not underwater trajectories. <a href="/data/ioos.json">Attributed GPS export</a>.</p><p>Baltic glider reports: <a href="https://erddap.observations.voiceoftheocean.org/erddap/index.html">Voice of the Ocean Foundation</a>; data collected and made freely available by the Foundation under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Locations may be estimated by the provider between surface fixes. Only good coordinate quality flags and reports within 24 hours are accepted. <a href="/data/baltic.json">Attributed glider export</a>.</p>'
                '<details><summary>Deployment record acknowledgments</summary><ul>'+links+'</ul></details></main>').encode()


class Handler(BaseHTTPRequestHandler):
    server_version = 'DroneMapper'
    def log_message(self, *args):
        pass

    def respond(self, code, body, content_type, head=False, cache='no-store'):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def json(self, code, value, head=False):
        self.respond(code, json.dumps(value, allow_nan=False, separators=(',', ':')).encode(), 'application/json; charset=utf-8', head)

    def do_HEAD(self):
        self.do_GET(True)

    def do_GET(self, head=False):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path.startswith('/work/drone-mapper/'):
            path = path[len('/work/drone-mapper'):]
        if path == '/feed':
            try:
                hours = float(parse_qs(parsed.query).get('hours', ['0'])[0])
                if hours not in {0, 0.25, 1, 6, 24, 336}:
                    raise ValueError()
            except (ValueError, TypeError):
                return self.json(400, {'error': 'Invalid time window'}, head)
            return self.json(200, self.server.collector.snapshot(hours), head)
        if path == '/credits.html':
            return self.respond(200, self.server.collector.credits(), 'text/html; charset=utf-8', head)
        if path == '/api/police-coverage':
            with self.server.collector.lock:
                registry=[dict(id='sfpd',agency='San Francisco Police Department',portal='https://data.sf.gov/d/giw5-ttjs',refresh_seconds=3600)]+[{**a,'id':'police-'+a['id']} for a in AGENCIES]
                feeds=[]
                for a in registry:
                    p=self.server.collector.providers.get(a['id'],{}); records=p.get('records',[]); dates=sorted(r['event_date'] for r in records if r.get('event_date'))
                    feeds.append(dict(id=a['id'],agency=a['agency'],portal=a['portal'],records=len(records),newest_flight=dates[-1] if dates else None,oldest_flight=dates[0] if dates else None,last_checked=p.get('last_attempt'),last_success=p.get('last_success'),status='delayed' if p.get('error') else 'collecting' if p.get('last_success') else 'pending',check_interval_seconds=a['refresh_seconds'],coverage=p.get('coverage')))
                return self.json(200,dict(generated_at=time.time(),configured_flight_feeds=len(feeds),feeds_with_records=sum(bool(f['records']) for f in feeds),mapped_flights=sum(f['records'] for f in feeds),documented_program_records=len(self.server.collector.providers.get('atlas',{}).get('records',[])),feeds=feeds),head)
        if path == '/data/police-flights.json':
            with self.server.collector.lock:
                providers = {k:v for k,v in self.server.collector.providers.items() if k=='sfpd' or k.startswith('police-')}
                return self.json(200, {'attribution':'Agency-published flight facts; per-record source and license where specified', 'records':[r for v in providers.values() for r in v.get('records',[])], 'coverage':{k:{**(v.get('coverage') or {}), 'last_success':v.get('last_success'), 'error':v.get('error'), 'next_attempt':v.get('next_attempt')} for k,v in providers.items()}}, head)
        if path in {'/data/police-flights.json', '/data/milestones.json', '/data/ioos.json', '/data/floats.json', '/data/driverless.json', '/data/surveys.json', '/data/baltic.json', '/data/aircraft.json', '/data/ocean.json', '/data/history.json', '/data/programs.json', '/data/gliders.json'}:
            key = {'/data/police-flights.json':'sfpd', '/data/milestones.json':'milestones', '/data/ioos.json':'ioos', '/data/floats.json':'argo', '/data/driverless.json':'avmap', '/data/surveys.json':'oam', '/data/baltic.json':'voto', '/data/aircraft.json': 'adsb', '/data/ocean.json': 'noaa', '/data/history.json': 'climateviewer', '/data/programs.json': 'atlas', '/data/gliders.json': 'gliders'}[path]
            with self.server.collector.lock:
                data = [r for r in self.server.collector.providers.get(key, {}).get('records', [])
                        if r.get('record_type') != 'position' or time.time()-r.get('observed_at', 0) <= RETENTION]
                return self.json(200, {'attribution': {'sfpd':'City and County of San Francisco / SFPD · adapted published flight-log areas · PDDL 1.0', 'milestones':'Church of Malware / saviorSEC factual historical milestones; per-record primary evidence', 'ioos':'IOOS Glider DAC; Scripps Institution of Oceanography / Woods Hole Oceanographic Institution; adapted surface GPS subset; CC BY 4.0', 'argo':'International Argo Program and contributing national programs / Argo GDAC via Ifremer; https://doi.org/10.17882/42182; unrestricted data use, attribution requested', 'avmap':'AV Map contributors / Jackson Lester · MIT; see /licenses/av-map.txt','oam':'OpenAerialMap / Open Imagery Network contributors · adapted UAV survey metadata · CC BY 4.0; see per-record contributors','voto':'Voice of the Ocean Foundation; data collected and made freely available at https://erddap.observations.voiceoftheocean.org/erddap/index.html · CC BY 4.0','adsb': 'ADSB.lol · ODbL 1.0', 'noaa': 'NOAA AOML / PMEL and contributing operators; see per-record license', 'climateviewer': 'Jim Lee / ClimateViewer · adapted historical layer · CC BY-NC-SA 4.0', 'atlas': 'Electronic Frontier Foundation / Atlas of Surveillance · adapted drone-program areas · CC BY 4.0', 'gliders': 'NOAA AOML CoastWatch and contributing glider operators · freely redistributable data; see per-record terms'}[key], 'records': data}, head)
        root = PUBLIC
        if path.startswith('/hub-preview/'):
            root = ROOT / 'hub-preview'
            path = path[len('/hub-preview'):]
        file = (root / (path.lstrip('/') or 'index.html')).resolve()
        if file.is_dir():
            file /= 'index.html'
        if not file.is_relative_to(root.resolve()) or not file.is_file() or any(p.startswith('.') for p in file.relative_to(root).parts):
            return self.json(404, {'error': 'Not found'}, head)
        mime = 'text/javascript' if file.suffix == '.mjs' else mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        self.respond(200, file.read_bytes(), mime, head, 'public, max-age=3600' if '/vendor/' in str(file) else 'no-cache')

    def do_POST(self):
        self.json(405, {'error': 'Read-only website'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8780)
    parser.add_argument('--data-dir', default=ROOT / '.data', type=Path,
                        help='Cache directory (default: .data beside server.py)')
    args = parser.parse_args()
    if args.data_dir.resolve().is_relative_to(PUBLIC):
        parser.error('Cache directory must be outside public/')
    os.umask(0o077)
    build_archive()
    collector = Collector(args.data_dir)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    server.collector = collector
    worker = threading.Thread(target=collector.run, daemon=True)
    worker.start()
    print(f'DRONE MAPPER: http://{args.host}:{args.port}/ — external collection every 300 seconds', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        collector.stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
