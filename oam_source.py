"""Dated UAV survey footprints from OpenAerialMap, never aircraft positions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import re
import time
from urllib.parse import urlencode
from data_sources import fetch_json, finite, clean

OAM_URL = 'https://api.openaerialmap.org/meta'
YEAR = 365 * 86400

def timestamp(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, OverflowError):
        return None

def normalize_oam(payload, now=None):
    now = time.time() if now is None else now
    meta = payload.get('meta', {}) if isinstance(payload, dict) else {}
    if meta.get('provided_by') != 'OpenAerialMap' or meta.get('license') != 'CC-BY 4.0' or not isinstance(payload.get('results'), list):
        raise ValueError('Invalid UAV imagery catalog')
    records = {}
    for item in payload['results']:
        if not isinstance(item, dict) or item.get('platform') != 'uav':
            continue
        identifier, box = item.get('_id'), item.get('bbox')
        start, end = timestamp(item.get('acquisition_start')), timestamp(item.get('acquisition_end'))
        if (not isinstance(identifier, str) or not re.fullmatch(r'[a-f0-9]{24}', identifier)
                or not finite(start, now-YEAR, now) or not finite(end, start, now)
                or not isinstance(box, list) or len(box) != 4):
            continue
        west, south, east, north = box
        if (not finite(west, -180, 180) or not finite(east, -180, 180)
                or not finite(south, -90, 90) or not finite(north, -90, 90)
                or not 0 < east-west <= 2 or not 0 < north-south <= 2):
            continue
        title = clean(item.get('title'))
        if not title:
            continue
        dates = item['acquisition_start'][:10] + ' — ' + item['acquisition_end'][:10]
        records[identifier] = {
            'id': 'oam:' + identifier, 'record_type': 'historical', 'kind': 'drone', 'domain': 'air',
            'name': 'UAV survey — ' + title, 'model': None, 'manufacturer': None, 'operator': None,
            'purpose': 'unknown', 'latitude': (south+north)/2, 'longitude': (west+east)/2,
            'place': title, 'status': 'historical-survey', 'observed_at': None,
            'record_dates': dates, 'archive_year': datetime.fromtimestamp(end, timezone.utc).year,
            'precision': 'Center of published imagery footprint; not an aircraft position',
            'source': 'oam', 'source_url': OAM_URL,
            'evidence_url': 'https://api.openaerialmap.org/meta/' + identifier,
            'attribution': 'OpenAerialMap / Open Imagery Network contributors' + (' — ' + clean(item.get('provider')) if clean(item.get('provider')) else ''),
            'license': 'CC BY 4.0', 'license_url': 'https://openaerialmap.org/legal/',
            'verification': 'Contributor-labeled UAV imagery; capture dates and footprint, not a flight count',
        }
    return list(records.values())

def fetch_oam(now=None, get_json=fetch_json):
    now = time.time() if now is None else now
    query = {'platform': 'uav', 'acquisition_from': datetime.fromtimestamp(now-YEAR, timezone.utc).isoformat(),
             'acquisition_to': datetime.fromtimestamp(now, timezone.utc).isoformat(),
             'order_by': '_id', 'sort': 'desc', 'limit': 100}
    def page(number):
        return get_json(OAM_URL + '?' + urlencode({**query, 'page': number}))
    first = page(1)
    found = first.get('meta', {}).get('found')
    if not finite(found, 0, 3000) or int(found) != found:
        raise ValueError('UAV catalog pagination limit')
    pages = [first]
    with ThreadPoolExecutor(max_workers=3) as pool:
        pages.extend(pool.map(page, range(2, (int(found)+99)//100+1)))
    records, seen = {}, set()
    for number, payload in enumerate(pages, 1):
        meta = payload.get('meta', {})
        # Upstream response page labels race across concurrent requests. Validate
        # actual result sizes and unique IDs instead of trusting that label.
        if meta.get('found') != found or meta.get('limit') != 100 or len(payload.get('results', [])) != min(100, max(0, found-(number-1)*100)):
            raise ValueError('UAV catalog changed during pagination')
        for r in normalize_oam(payload, now):
            records[r['id']] = r
        for row in payload['results']:
            seen.add(row.get('_id'))
    if len(seen) != found:
        raise ValueError('Incomplete UAV catalog pagination')
    return list(records.values())
