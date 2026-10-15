"""Public EFF drone-program areas and NOAA reported underwater glider positions."""
from datetime import datetime
import re
import time
from urllib.parse import urlencode
from data_sources import fetch_json, finite

ATLAS_LAYER = 'https://services8.arcgis.com/0emesQkjyT7tJv3q/arcgis/rest/services/AOS_CITY/FeatureServer/0'
ATLAS_FIELDS = 'AOSNUMBER,Agency,City,County,State,Technology,Summary,Link_1_Date,Link_2_Date,Link_3_Date,ObjectId'
GLIDERS_PAGE = 'https://cwcgom.aoml.noaa.gov/erddap/tabledap/GLIDERS_LAST_10_DAYS_LOCATIONS.html'
GLIDERS_URL = GLIDERS_PAGE[:-5] + '.json?platform_name,time,latitude,longitude&orderByMax(%22platform_name,time%22)'
# Conservative exclusion: planning mentions can describe future additions to an
# existing program. Omit those ambiguous records rather than infer deployment.
UNCONFIRMED = re.compile(r'\b(plan(?:s|ned)? to|intend|not yet|no longer|discontinu|terminat|cancel|propos|has not|never|abandon)', re.I)

def clean(value, limit=200):
    return str(value or '').replace('\0', '').strip()[:limit]

def normalize_atlas(payload):
    if (not isinstance(payload, dict) or payload.get('error')
            or payload.get('geometryType') != 'esriGeometryPoint'
            or payload.get('spatialReference', {}).get('wkid') != 4326
            or not isinstance(payload.get('features'), list)):
        raise ValueError('Invalid Atlas map layer')
    records = {}
    for feature in payload['features']:
        p, g = feature.get('attributes') or {}, feature.get('geometry') or {}
        identifier, agency = clean(p.get('AOSNUMBER')), clean(p.get('Agency'))
        lat, lon = g.get('y'), g.get('x')
        if (p.get('Technology') != 'Drones' or not re.fullmatch(r'AOS\d{6,12}', identifier)
                or not agency or not finite(lat, -90, 90) or not finite(lon, -180, 180)
                or (lat == 0 and lon == 0) or UNCONFIRMED.search(p.get('Summary') or '')):
            continue
        place = ', '.join(clean(p.get(k)) for k in ('City', 'County', 'State') if clean(p.get(k)))
        if not place:
            continue
        dates = list(dict.fromkeys(clean(p.get(f'Link_{n}_Date'), 80) for n in (1, 2, 3) if clean(p.get(f'Link_{n}_Date'))))
        records[identifier] = {
            'id': 'atlas:' + identifier, 'record_type': 'activity', 'kind': 'drone', 'domain': 'air',
            'name': agency + ' — drone program', 'model': None, 'manufacturer': None,
            'operator': agency, 'purpose': 'public-safety', 'latitude': lat, 'longitude': lon,
            'place': place, 'status': 'documented-program', 'observed_at': None,
            'record_dates': '; '.join(dates) or None,
            'precision': 'Approximate agency area; not a vehicle position',
            'source': 'atlas', 'source_url': ATLAS_LAYER,
            'evidence_url': 'https://www.atlasofsurveillance.org/atlas',
            'attribution': 'Electronic Frontier Foundation / Atlas of Surveillance',
            'license': 'CC BY 4.0', 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
            'verification': 'Documented drone program; continued operation unverified',
        }
    return list(records.values())

def fetch_atlas():
    records = {}
    for page in range(10):
        query = urlencode({'where': "Technology='Drones'", 'outFields': ATLAS_FIELDS,
                           'outSR': '4326', 'f': 'json', 'orderByFields': 'ObjectId',
                           'resultRecordCount': 1999, 'resultOffset': page * 1999})
        payload = fetch_json(ATLAS_LAYER + '/query?' + query)
        for record in normalize_atlas(payload):
            records[record['id']] = record
        if not payload.get('exceededTransferLimit'):
            return list(records.values())
        if not payload['features']:
            raise ValueError('Incomplete Atlas pagination')
    raise ValueError('Atlas pagination limit reached')

def normalize_gliders(payload, now=None):
    now = time.time() if now is None else now
    table = payload.get('table', {}) if isinstance(payload, dict) else {}
    if (table.get('columnNames') != ['platform_name', 'time', 'latitude', 'longitude']
            or table.get('columnUnits') != [None, 'UTC', 'degrees_north', 'degrees_east']
            or not isinstance(table.get('rows'), list) or len(table['rows']) > 10000):
        raise ValueError('Invalid glider position table')
    records = {}
    for row in table['rows']:
        if not isinstance(row, list) or len(row) != 4:
            raise ValueError('Invalid glider row')
        identifier, stamp, lat, lon = row
        if (not isinstance(identifier, str) or not re.fullmatch(r'\d{7}', identifier)
                or not isinstance(stamp, str) or not stamp.endswith('Z')
                or not finite(lat, -90, 90) or not finite(lon, -180, 180)):
            continue
        try:
            observed = datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp()
        except (ValueError, OverflowError):
            continue
        if not finite(observed, now - 86400, now + 5):
            continue
        if identifier in records and records[identifier]['observed_at'] >= observed:
            continue
        records[identifier] = {
            'id': 'glider:' + identifier, 'record_type': 'position', 'kind': 'underwater', 'domain': 'water',
            'name': 'Glider ' + identifier, 'model': None, 'manufacturer': None, 'operator': None,
            'purpose': 'research', 'latitude': lat, 'longitude': lon, 'observed_at': observed,
            'status': 'observed', 'position_basis': 'reported',
            'precision': 'Published glider location; positioning method unspecified',
            'source': 'gliders', 'source_url': GLIDERS_PAGE, 'evidence_url': GLIDERS_PAGE,
            'attribution': 'NOAA AOML CoastWatch and contributing glider operators',
            'license': 'NOAA freely redistributable data',
            'license_url': 'https://cwcgom.aoml.noaa.gov/erddap/info/GLIDERS_LAST_10_DAYS_LOCATIONS/index.html',
        }
    return list(records.values())

def fetch_gliders():
    return normalize_gliders(fetch_json(GLIDERS_URL))
