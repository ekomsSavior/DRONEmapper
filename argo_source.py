"""Public Argo profiling-float surface fixes. Church of Malware / saviorSEC."""
from datetime import datetime, timezone
import math
import re
import time

BASE = 'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats'
CREDIT = 'International Argo Program and contributing national programs, part of the Global Ocean Observing System; Argo GDAC via Ifremer; https://doi.org/10.17882/42182'
COLUMNS = ['platform_number', 'platform_type', 'time', 'time_location', 'latitude', 'longitude', 'position_qc', 'time_qc', 'positioning_system']
UNITS = [None, None, 'UTC', 'UTC', 'degrees_north', 'degrees_east', None, None, None]


def stamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z', value):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def number(value, low, high):
    return type(value) in (float, int) and math.isfinite(value) and low <= value <= high


def argo_url(now=None):
    now = time.time() if now is None else now
    def iso(t):
        return datetime.fromtimestamp(int(t), timezone.utc).isoformat().replace('+00:00', 'Z')
    return BASE + '.json?' + ','.join(COLUMNS) + '&time%3E=' + iso(now-86400) + '&time%3C=' + iso(now) + '&distinct()'


def normalize_argo(payload, now=None):
    now = time.time() if now is None else now
    t = payload.get('table', {}) if isinstance(payload, dict) else {}
    if t.get('columnNames') != COLUMNS or t.get('columnUnits') != UNITS or not isinstance(t.get('rows'), list) or len(t['rows']) > 10000:
        raise ValueError('Invalid Argo table')
    newest = {}
    for row in t['rows']:
        if not isinstance(row, list) or len(row) != 9:
            raise ValueError('Invalid Argo row')
        wmo, model, profile_time, position_time, lat, lon, pq, tq, method = row
        observed, profile = stamp(position_time), stamp(profile_time)
        if (not isinstance(wmo, str) or not re.fullmatch(r'\d{7}', wmo)
                or not isinstance(model, str) or not re.fullmatch(r'[A-Z0-9_ -]{1,64}', model)
                or pq != '1' or tq != '1' or method not in ('GPS', 'ARGOS', 'IRIDIUM')
                or not number(profile, now-86400, now+5) or not number(observed, now-86400, now+5)
                or not number(lat, -90, 90) or not number(lon, -180, 180) or (lat == 0 and lon == 0)):
            continue
        if wmo in newest and newest[wmo]['observed_at'] >= observed:
            continue
        newest[wmo] = {
            'id': 'argo:'+wmo, 'wmo_id': wmo, 'record_type': 'position',
            'kind': 'profiling-float', 'domain': 'water', 'name': 'Argo '+wmo,
            'model': model, 'manufacturer': None, 'operator': None, 'purpose': 'research',
            'latitude': lat, 'longitude': lon, 'observed_at': observed, 'profile_at': profile,
            'status': 'observed', 'position_basis': 'reported', 'position_method': method.lower(),
            'precision': 'Last reported surface fix; current underwater position unknown',
            'source': 'argo', 'source_url': BASE+'.html', 'evidence_url': 'https://doi.org/10.17882/42182',
            'attribution': CREDIT, 'license': 'Argo unrestricted data use; attribution requested',
            'license_url': 'https://argo.ucsd.edu/data/acknowledging-argo/',
        }
    return list(newest.values())


def fetch_argo(fetch_json=None, now=None):
    if fetch_json is None:
        from data_sources import fetch_json
    now = time.time() if now is None else now
    return normalize_argo(fetch_json(argo_url(now)), now)
