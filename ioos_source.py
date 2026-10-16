"""IOOS Glider DAC: verified Spray surface GPS reports, CC BY 4.0."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import re
import time
from voto_source import number, stamp, deduplicate_glider_positions

IOOS_BASE = 'https://gliders.ioos.us/erddap'
DATASET_ID = re.compile(r'sp\d{3}-\d{8}T\d{4}')


def ioos_catalog_url(now=None):
    now = time.time() if now is None else now
    since = datetime.fromtimestamp(now-86400, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    return IOOS_BASE + '/tabledap/allDatasets.json?datasetID,title,maxTime&maxTime%3E=' + since


def ioos_datasets(payload, now=None):
    now = time.time() if now is None else now
    t = payload.get('table', {})
    if t.get('columnNames') != ['datasetID', 'title', 'maxTime'] or not isinstance(t.get('rows'), list):
        raise ValueError('Invalid IOOS catalog')
    ids = set()
    for r in t['rows']:
        if not isinstance(r, list) or len(r) != 3:
            raise ValueError('Invalid IOOS catalog row')
        if isinstance(r[0], str) and DATASET_ID.fullmatch(r[0]) and number(stamp(r[2]), now-86400, now+5):
            ids.add(r[0])
    if len(ids) > 32:
        raise ValueError('Unexpected IOOS Spray fleet size')
    return sorted(ids)


def ioos_metadata(payload, identifier):
    if not DATASET_ID.fullmatch(identifier):
        raise ValueError('Invalid IOOS dataset identifier')
    t = payload.get('table', {})
    if t.get('columnNames') != ['Row Type', 'Variable Name', 'Attribute Name', 'Data Type', 'Value'] or not isinstance(t.get('rows'), list):
        raise ValueError('Invalid IOOS metadata')
    a = {}
    for r in t['rows']:
        if not isinstance(r, list) or len(r) != 5:
            raise ValueError('Invalid IOOS metadata row')
        if r[0] == 'attribute':
            a[(r[1], r[2])] = r[4]
    platform = identifier.split('-')[0]
    wmo = a.get(('platform', 'wmo_id'))
    operator = a.get(('NC_GLOBAL', 'institution'))
    if (a.get(('NC_GLOBAL', 'platform_type')) != 'Spray Glider'
            or a.get(('platform', 'id')) != platform or not re.fullmatch(r'\d{7}', str(wmo or ''))
            or operator not in {'Scripps Institution of Oceanography', 'Woods Hole Oceanographic Institution'}
            or a.get(('platform', 'platform_maker')) != 'Scripps Institution of Oceanography Instrument Development Group'
            or 'https://creativecommons.org/licenses/by/4.0/' not in str(a.get(('NC_GLOBAL', 'license')))
            or a.get(('gps_end_lat', 'units')) != 'degrees_north'
            or a.get(('gps_end_lon', 'units')) != 'degrees_east'
            or a.get(('gps_end_time', 'units')) != 'seconds since 1970-01-01T00:00:00Z'
            or 'GPS at surface' not in str(a.get(('gps_end_lat', 'comment')))
            or 'GPS time' not in str(a.get(('gps_end_time', 'comment')))
            or a.get(('gps_end_qc', 'flag_values')) != '1, 2, 3, 4, 9'
            or a.get(('gps_end_qc', 'flag_meanings')) != 'good not_evaluated questionable bad missing'):
        raise ValueError('Unverified IOOS surface GPS metadata')
    return {'dataset_id': identifier, 'platform_id': platform, 'wmo_id': wmo, 'operator': operator}


def ioos_position_url(identifier):
    if not DATASET_ID.fullmatch(identifier):
        raise ValueError('Invalid IOOS dataset identifier')
    return (IOOS_BASE + '/tabledap/' + identifier
            + '.json?wmo_id,gps_end_time,gps_end_lat,gps_end_lon,gps_end_qc&gps_end_qc=1&orderByMax(%22gps_end_time%22)')


def normalize_ioos(payload, meta, now=None):
    now = time.time() if now is None else now
    t = payload.get('table', {})
    if (t.get('columnNames') != ['wmo_id', 'gps_end_time', 'gps_end_lat', 'gps_end_lon', 'gps_end_qc']
            or t.get('columnUnits') != [None, 'UTC', 'degrees_north', 'degrees_east', None]
            or not isinstance(t.get('rows'), list) or len(t['rows']) > 100):
        raise ValueError('Invalid IOOS GPS table')
    newest = None
    for r in t['rows']:
        if not isinstance(r, list) or len(r) != 5:
            raise ValueError('Invalid IOOS GPS row')
        wmo, date, lat, lon, qc = r
        observed = stamp(date)
        if (wmo != meta['wmo_id'] or type(qc) is not int or qc != 1
                or not number(observed, now-86400, now+5) or not number(lat, -90, 90) or not number(lon, -180, 180)
                or (lat == 0 and lon == 0) or (newest and newest['observed_at'] >= observed)):
            continue
        page = IOOS_BASE + '/tabledap/' + meta['dataset_id'] + '.html'
        newest = dict(id='ioos:'+wmo, wmo_id=wmo, platform_id=meta['platform_id'],
                      record_type='position', kind='underwater', domain='water', name='Spray '+meta['platform_id'],
                      model='Spray glider', manufacturer='Scripps Institution of Oceanography Instrument Development Group',
                      operator=meta['operator'], purpose='research', latitude=lat, longitude=lon, observed_at=observed,
                      status='observed', position_basis='measured', position_method='surface-gps',
                      position_quality='Provider GPS QC passed (1)', precision='Surface GPS at dive end; no underwater position inferred',
                      source='ioos', source_url=page, evidence_url=page,
                      attribution=meta['operator']+' / IOOS Glider DAC; adapted surface GPS subset',
                      license='CC BY 4.0', license_url='https://creativecommons.org/licenses/by/4.0/')
    return [newest] if newest else []


def fetch_ioos(fetch_json=None, now=None):
    if fetch_json is None:
        from data_sources import fetch_json
    now = time.time() if now is None else now
    ids = ioos_datasets(fetch_json(ioos_catalog_url(now)), now)
    def fetch_one(identifier):
        meta = ioos_metadata(fetch_json(IOOS_BASE+'/info/'+identifier+'/index.json'), identifier)
        return normalize_ioos(fetch_json(ioos_position_url(identifier)), meta, now)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = [r for group in pool.map(fetch_one, ids) for r in group]
    return deduplicate_glider_positions(sorted(records, key=lambda r: r['id']))
