"""Agency-published flight logs; never interpreted as live aircraft positions."""
from datetime import date, datetime, timezone
import re
from urllib.parse import urlencode
from data_sources import fetch_json, finite

SFPD_PAGE = 'https://data.sf.gov/d/giw5-ttjs'
SFPD_META = 'https://data.sf.gov/api/views/giw5-ttjs.json'
SFPD_URL = 'https://data.sf.gov/resource/giw5-ttjs.json'
SFPD_SELECT = ':id as source_row_id,date,flight_duration_minutes,reason_for_flight,point,analysis_neighborhood,data_loaded_at'
SFPD_REFRESH = 3600
PAGE_SIZE, MAX_PAGES = 2000, 25
PURPOSES = {re.sub(r'\s', '', x.lower()): x for x in (
    'Criminal Investigation', 'Training/Test', 'Major or Critical Incidents', 'Fire/Mutual Aid')}


def clean(value, limit=160):
    return value.replace('\0', '').strip()[:limit] if isinstance(value, str) else ''


def flight_date(value, today=None):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)?', value):
        return None
    day = value[:10]
    try:
        date.fromisoformat(day)
    except ValueError:
        return None
    return day if '2024-05-16' <= day <= (today or datetime.now(timezone.utc).date().isoformat()) else None


def normalize_sfpd(rows, today=None):
    if not isinstance(rows, list):
        raise ValueError('Invalid SFPD flight rows')
    records = {}
    for p in rows:
        if not isinstance(p, dict):
            raise ValueError('Invalid SFPD flight row')
        identifier, day = p.get('source_row_id'), flight_date(p.get('date'), today)
        # Socrata identifiers are opaque, not URL slugs. Preserve punctuation exactly.
        if not isinstance(identifier, str) or not re.fullmatch(r'[\x21-\x7e]{1,200}', identifier):
            raise ValueError('Invalid SFPD row identifier')
        if identifier in records:
            raise ValueError('Duplicate SFPD row identifier')
        g = p.get('point')
        if not day or not isinstance(g, dict) or g.get('type') != 'Point' or not isinstance(g.get('coordinates'), list) or len(g['coordinates']) != 2:
            continue
        lon, lat = g['coordinates']
        if not finite(lat, 37.6, 37.9) or not finite(lon, -122.6, -122.3):
            continue
        raw = p.get('flight_duration_minutes')
        duration = float(raw) if isinstance(raw, str) and re.fullmatch(r'\d+(?:\.\d+)?', raw) else raw
        purpose = PURPOSES.get(re.sub(r'\s', '', clean(p.get('reason_for_flight')).lower()), 'Other / unspecified')
        place = clean(p.get('analysis_neighborhood'))
        records[identifier] = {
            'id': 'sfpd-flight:' + identifier, 'record_type': 'historical', 'kind': 'drone', 'domain': 'air',
            'name': 'SFPD drone flight · ' + day, 'model': None, 'manufacturer': None,
            'operator': 'San Francisco Police Department', 'purpose': 'public-safety',
            'latitude': lat, 'longitude': lon, 'place': place + ', San Francisco' if place else 'San Francisco',
            'status': 'published-flight', 'record_dates': day, 'event_date': day, 'observed_at': None,
            'flight_purpose': purpose, 'reported_duration_minutes': duration if finite(duration, 0, 1440) else None,
            'publication_date': flight_date(p.get('data_loaded_at'), today),
            'precision': 'Published operation area; intersection or 100-block, not aircraft GPS',
            'source': 'sfpd', 'source_url': SFPD_URL, 'evidence_url': SFPD_PAGE,
            'attribution': 'City and County of San Francisco / San Francisco Police Department',
            'license': 'PDDL-1.0', 'license_url': 'https://opendatacommons.org/licenses/pddl/1.0/',
            'verification': 'Agency-published flight log; monthly publication',
        }
    return list(records.values())


def revision(meta):
    if not isinstance(meta, dict) or meta.get('id') != 'giw5-ttjs' or meta.get('licenseId') != 'PDDL' or not finite(meta.get('rowsUpdatedAt'), 1, 1e11):
        raise ValueError('Invalid SFPD dataset metadata')
    fields = {c.get('fieldName'): c.get('dataTypeName') for c in meta.get('columns', [])}
    for name, typ in dict(date='calendar_date', point='point', flight_duration_minutes='number', reason_for_flight='text', analysis_neighborhood='text', data_loaded_at='calendar_date').items():
        if fields.get(name) != typ:
            raise ValueError('SFPD schema changed')
    return meta['rowsUpdatedAt']


def fetch_sfpd(fetch=fetch_json):
    before, rows, seen = revision(fetch(SFPD_META)), [], set()
    for page in range(MAX_PAGES):
        query = urlencode({'$select': SFPD_SELECT, '$order': ':id', '$limit': PAGE_SIZE, '$offset': page * PAGE_SIZE})
        batch = fetch(SFPD_URL + '?' + query)
        if not isinstance(batch, list) or len(batch) > PAGE_SIZE:
            raise ValueError('Invalid SFPD page')
        for row in batch:
            identifier = row.get('source_row_id') if isinstance(row, dict) else None
            if not isinstance(identifier, str) or identifier in seen:
                raise ValueError('Incomplete SFPD pagination')
            seen.add(identifier)
            rows.append(row)
        if len(batch) < PAGE_SIZE:
            break
    else:
        raise ValueError('SFPD pagination limit reached')
    if revision(fetch(SFPD_META)) != before:
        raise ValueError('SFPD dataset changed during collection')
    records = normalize_sfpd(rows)
    if rows and not records:
        raise ValueError('No usable SFPD coordinates or dates')
    return records
