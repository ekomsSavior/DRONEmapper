"""DRONE MAPPER public-data adapters, AGPL-3.0-or-later.

Only documented public endpoints. No radio collection, login scraping, generated
positions or commercial tracker code. Provider citations are retained for credits
and audit, separate from the map interface.
"""
import json
import math
import time
import urllib.request
from urllib.parse import urlsplit

DEPLOY_URL = 'https://registry.deploy.report/v1/map/deployments'
ADSB_URL = 'https://api.adsb.lol/v2/type/Q1,Q4,Q9,Q25'
DEPLOY_CREDIT = 'https://registry.deploy.report/terms'
ADSB_CREDIT = 'https://www.adsb.lol/docs/open-data/api/'

# Explicit unmanned aircraft families. Q5 and generic aircraft are excluded.
UAV_TYPES = {'Q1': ('General Atomics', 'Predator / Gray Eagle family'),
             'Q4': ('Northrop Grumman', 'Global Hawk / Triton family'),
             'Q9': ('General Atomics', 'MQ-9 family'),
             'Q25': ('Boeing', 'MQ-25 Stingray')}
TYPE_EVIDENCE = 'https://www.faa.gov/air_traffic/publications/atpubs/cnt_html/'

KINDS = {
    'aerial': ('drone', 'air'), 'drone': ('drone', 'air'),
    'quadruped': ('robot-dog', 'ground'), 'humanoid': ('humanoid', 'ground'),
    'sidewalk': ('delivery-robot', 'ground'), 'av': ('autonomous-vehicle', 'ground'),
    'truck': ('autonomous-vehicle', 'ground'), 'defense_ugv': ('ground-robot', 'ground'),
    'amr': ('ground-robot', 'ground'), 'service': ('ground-robot', 'ground'),
    'agriculture': ('ground-robot', 'ground'), 'industrial_robot': ('industrial-robot', 'ground'),
    'construction': ('ground-robot', 'ground'), 'food_service': ('ground-robot', 'ground'),
    'mining': ('ground-robot', 'ground'), 'security_patrol': ('ground-robot', 'ground'),
    'commercial_cleaning': ('ground-robot', 'ground'), 'robot_vacuum': ('ground-robot', 'ground'),
    'cobot': ('industrial-robot', 'ground'), 'companion_robot': ('ground-robot', 'ground'),
    'manipulator': ('industrial-robot', 'ground'), 'lawn_mower': ('ground-robot', 'ground'),
    'forklift': ('ground-robot', 'ground'), 'kitchen_robot': ('industrial-robot', 'ground'),
    'underwater': ('underwater', 'water'), 'maritime_surface': ('surface-vessel', 'water'),
    'maritime': ('surface-vessel', 'water'), 'inspection': ('ground-robot', 'ground')}
# Piloted aircraft / infrastructure mistakenly grouped with drones upstream.
EXCLUDE_MODELS = {'AIR ONE', 'Archer', 'Matternet Station', 'Skydio Dock', 'Wisk Cora'}
GOOD_STATUSES = {'operational', 'scaled', 'pilot'}

# Dedicated delivery programs confirmed by their operators; never use a generic
# drone brand (DJI, Autel, etc.) as a purpose or ownership classifier.
DELIVERY_PROGRAMS = {
    ('amazon-prime-air', 'Amazon Prime Air MK30'): 'https://www.aboutamazon.com/news/operations/mk30-drone-amazon-delivery-packages',
    ('wing', 'Wing Delivery Aircraft'): 'https://wing.com/technology',
    ('zipline', 'Zipline Platform 1 (Zip)'): 'https://www.zipline.com/about/zipline-fact-sheet',
    ('zipline', 'Zipline Platform 2 (P2)'): 'https://www.zipline.com/about/zipline-fact-sheet',
    ('zipline', 'Zipline Zip'): 'https://www.zipline.com/about/zipline-fact-sheet',
}



def finite(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high


def clean(value, limit=200):
    return str(value or '').replace('\x00', '').strip()[:limit]


def https(value):
    if not isinstance(value, str):
        return False
    p = urlsplit(value)
    return p.scheme == 'https' and bool(p.hostname) and not p.username and not p.password


def fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'DRONE-MAPPER/0.2 (public-data map; five-minute cache)', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = response.read(12_000_001)
        if len(payload) > 12_000_000:
            raise ValueError('Source response exceeds size limit')
        return json.loads(payload)


def normalize_deploy(payload, collected_at=None):
    if not isinstance(payload, dict) or not isinstance(payload.get('features'), list):
        raise ValueError('Invalid deployment collection')
    collected_at = time.time() if collected_at is None else collected_at
    year_now = time.gmtime(collected_at).tm_year
    records = {}
    for feature in payload['features']:
        if not isinstance(feature, dict):
            continue
        p, geometry = feature.get('properties', {}), feature.get('geometry', {})
        if not isinstance(p, dict) or not isinstance(geometry, dict):
            continue
        form = p.get('formFactor')
        if form not in KINDS or p.get('status') not in GOOD_STATUSES or p.get('modelName') in EXCLUDE_MODELS:
            continue
        coordinates = geometry.get('coordinates', [])
        if geometry.get('type') != 'Point' or not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        lon, lat = coordinates[:2]
        if not finite(lat, -90, 90) or not finite(lon, -180, 180) or (lat == 0 and lon == 0):
            continue
        slug, model, place = clean(p.get('slug'), 250), clean(p.get('modelName')), clean(p.get('locationName'))
        if not slug or not model or not place or place.lower() in {'global', 'worldwide', 'various', 'multiple locations'}:
            continue
        year = p.get('startYear')
        if year is not None and (not finite(year, 1900, year_now) or int(year) != year):
            continue
        # Published locations are deployment areas, never current vehicle GPS.
        # Upstream sometimes calls a country centroid verified; precision remains
        # approximate here for every deployment until individually verified.
        kind, domain = KINDS[form]
        purpose_evidence = DELIVERY_PROGRAMS.get((p.get('companySlug'), model))
        purpose = 'delivery' if form == 'sidewalk' or purpose_evidence else 'unknown'
        operator = clean(p.get('companyName')) if p.get('operatorType') == 'maker_operated' else None
        canonical = p.get('deploymentUrl')
        if not isinstance(canonical, str) or not canonical.startswith('/deployments/') or '..' in canonical:
            continue
        records[slug] = {'id': 'deployment:' + slug, 'record_type': 'activity', 'kind': kind,
                         'domain': domain, 'name': model, 'model': model,
                         'manufacturer': clean(p.get('companyName')) or None,
                         'operator': operator, 'purpose': purpose, 'purpose_evidence_url': purpose_evidence,
                         'latitude': lat, 'longitude': lon, 'place': place,
                         'status': 'pilot' if p['status'] == 'pilot' else 'reported-operational',
                         'first_year': int(year) if year is not None else None,
                         'observed_at': None, 'collected_at': collected_at,
                         'precision': 'Approximate deployment area',
                         'source': 'deploy', 'source_url': DEPLOY_URL,
                         'evidence_url': 'https://registry.deploy.report' + canonical,
                         'verification': 'Published deployment record; not independently field-verified'}
    return list(records.values())


def normalize_adsb(payload, collected_at=None):
    collected_at = time.time() if collected_at is None else collected_at
    if not isinstance(payload, dict) or not isinstance(payload.get('ac'), list):
        raise ValueError('Invalid position collection')
    raw_now = payload.get('now')
    if not finite(raw_now, 0, 1e14):
        raise ValueError('Missing source timestamp')
    source_time = raw_now/1000 if raw_now > 1e11 else raw_now
    if source_time > collected_at + 30 or collected_at-source_time > 86400:
        raise ValueError('Invalid or stale source timestamp')
    records = []
    for aircraft in payload['ac']:
        if not isinstance(aircraft, dict) or aircraft.get('t') not in UAV_TYPES:
            continue
        if aircraft.get('simulated') is True or aircraft.get('test_broadcast') is True:
            continue
        position = aircraft
        if 'lat' not in aircraft or 'lon' not in aircraft:
            position = aircraft.get('lastPosition') or {}
        lat, lon, seen = position.get('lat'), position.get('lon'), position.get('seen_pos')
        if not finite(lat, -90, 90) or not finite(lon, -180, 180) or not finite(seen, 0, 86400):
            continue
        observed = source_time - seen
        if collected_at - observed > 86400 or observed > collected_at+5:
            continue
        identifier = clean(aircraft.get('hex'), 12)
        if not identifier or any(c not in '~0123456789abcdef' for c in identifier.lower()):
            continue
        manufacturer, family = UAV_TYPES[aircraft['t']]
        record = {'id': 'aircraft:' + identifier, 'record_type': 'position', 'kind': 'drone',
                  'domain': 'air', 'name': family, 'model': family, 'manufacturer': manufacturer,
                  'operator': None, 'purpose': 'unknown', 'latitude': lat, 'longitude': lon,
                  'observed_at': observed, 'collected_at': collected_at,
                  'status': 'observed', 'precision': 'Broadcast position',
                  'registration': clean(aircraft.get('r'), 40) or None,
                  'callsign': clean(aircraft.get('flight'), 30) or None,
                  'type_code': aircraft['t'], 'source': 'adsb', 'source_url': ADSB_URL,
                  'evidence_url': TYPE_EVIDENCE, 'trail': [],
                  'verification': 'Unmanned type family; subtype and operator not verified'}
        # Never attach a current altitude/heading to a historical lastPosition.
        if position is aircraft:
            if finite(aircraft.get('alt_geom'), -3000, 100000):
                record.update(altitude_m=aircraft['alt_geom']*0.3048, altitude_reference='WGS84')
            if finite(aircraft.get('gs'), 0, 1500):
                record['speed_mps'] = aircraft['gs']*0.514444
            if finite(aircraft.get('track'), 0, 359.999):
                record['heading_deg'] = aircraft['track']
        records.append(record)
    return records
