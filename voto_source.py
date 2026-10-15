"""VOTO public CC BY 4.0 glider reports. No locally generated positions."""
from datetime import datetime, timezone
import math
import re
import time

VOTO_BASE = 'https://erddap.observations.voiceoftheocean.org/erddap'
VOTO_CREDIT = ('Voice of the Ocean Foundation; data collected and made freely available '
               'at https://erddap.observations.voiceoftheocean.org/erddap/index.html')
DATASET_ID = re.compile(r'nrt_(SEA|SHW)\d+_M\d+')


def stamp(value):
    if not isinstance(value, str) or not value.endswith('Z'):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, OverflowError):
        return None


def number(value, low, high):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and low <= value <= high


def voto_catalog_url(now=None):
    now = time.time() if now is None else now
    since = datetime.fromtimestamp(now - 86400, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    return VOTO_BASE + '/tabledap/allDatasets.json?datasetID,title,maxTime&maxTime%3E=' + since


def voto_position_url(identifier):
    if not DATASET_ID.fullmatch(identifier):
        raise ValueError('Invalid VOTO dataset identifier')
    return (VOTO_BASE + '/tabledap/' + identifier + '.json?time,latitude,longitude'
            '&latitude%3E=-90&latitude%3C=90&longitude%3E=-180&longitude%3C=180'
            '&latitude_qc=1&longitude_qc=1'
            '&orderByMax(%22time%22)')


def voto_datasets(payload, now=None):
    now = time.time() if now is None else now
    table = payload.get('table', {}) if isinstance(payload, dict) else {}
    if table.get('columnNames') != ['datasetID', 'title', 'maxTime'] or not isinstance(table.get('rows'), list):
        raise ValueError('Invalid VOTO catalog')
    identifiers = set()
    for row in table['rows']:
        if not isinstance(row, list) or len(row) != 3:
            raise ValueError('Invalid VOTO catalog row')
        identifier, _, maximum = row
        observed = stamp(maximum)
        if isinstance(identifier, str) and DATASET_ID.fullmatch(identifier) and number(observed, now - 86400, now + 5):
            identifiers.add(identifier)
    if len(identifiers) > 64:
        raise ValueError('Unexpected VOTO fleet size')
    return sorted(identifiers)


def voto_metadata(payload, identifier):
    if not DATASET_ID.fullmatch(identifier):
        raise ValueError('Invalid VOTO dataset identifier')
    table = payload.get('table', {}) if isinstance(payload, dict) else {}
    if table.get('columnNames') != ['Row Type', 'Variable Name', 'Attribute Name', 'Data Type', 'Value'] or not isinstance(table.get('rows'), list):
        raise ValueError('Invalid VOTO metadata')
    attributes = {}
    for row in table['rows']:
        if not isinstance(row, list) or len(row) != 5:
            raise ValueError('Invalid VOTO metadata row')
        if row[0] == 'attribute':
            attributes[(row[1], row[2])] = row[4]
    meta = {key[1]: value for key, value in attributes.items() if key[0] == 'NC_GLOBAL'}
    serial = identifier.split('_')[1]
    if (meta.get('institution', '').lower() != 'voice of the ocean foundation'
            or meta.get('dataset_id') != identifier or meta.get('glider_serial') != serial
            or meta.get('glider_model') != 'SeaExplorer'
            or meta.get('source') != 'Observational data from a profiling glider.'
            or not re.fullmatch(r'\d{7}', str(meta.get('wmo_id', '')))
            or 'creativecommons.org/licenses/by/4.0/' not in meta.get('license', '')
            or any(attributes.get((v, 'comment')) != 'Estimated between surface fixes' for v in ('latitude', 'longitude'))
            or any(attributes.get((v, 'flag_meanings')) != 'GOOD, UNKNOWN, SUSPECT, FAIL, MISSING'
                   or attributes.get((v, 'flag_values')) != '1, 2, 3, 4, 9'
                   for v in ('latitude_qc', 'longitude_qc'))):
        raise ValueError('Unverified VOTO glider metadata')
    meta['glider_name'] = str(meta.get('glider_name') or serial).replace('\0', '').strip()[:120]
    return meta


def normalize_voto(payload, meta, now=None):
    now = time.time() if now is None else now
    table = payload.get('table', {}) if isinstance(payload, dict) else {}
    if (table.get('columnNames') != ['time', 'latitude', 'longitude']
            or table.get('columnUnits') != ['UTC', 'degrees_north', 'degrees_east']
            or not isinstance(table.get('rows'), list) or len(table['rows']) > 100):
        raise ValueError('Invalid VOTO position table')
    newest = None
    for row in table['rows']:
        if not isinstance(row, list) or len(row) != 3:
            raise ValueError('Invalid VOTO position row')
        date, lat, lon = row
        observed = stamp(date)
        if (not number(observed, now - 86400, now + 5) or not number(lat, -90, 90)
                or not number(lon, -180, 180) or (lat == 0 and lon == 0)):
            continue
        if newest and newest['observed_at'] >= observed:
            continue
        page = VOTO_BASE + '/tabledap/' + meta['dataset_id'] + '.html'
        newest = {
            'id': 'voto:' + meta['wmo_id'], 'wmo_id': meta['wmo_id'],
            'record_type': 'position', 'kind': 'underwater', 'domain': 'water',
            'name': meta['glider_name'] + ' (' + meta['glider_serial'] + ')',
            'model': 'SeaExplorer', 'manufacturer': 'ALSEAMAR',
            'operator': 'Voice of the Ocean Foundation', 'purpose': 'research',
            'latitude': lat, 'longitude': lon, 'observed_at': observed,
            'status': 'observed', 'position_basis': 'reported', 'position_method': 'provider-estimated',
            'precision': 'Provider-estimated between surface fixes; no extrapolation',
            'source': 'voto', 'source_url': page, 'evidence_url': page,
            'attribution': VOTO_CREDIT, 'license': 'CC BY 4.0',
            'license_url': 'https://creativecommons.org/licenses/by/4.0/',
        }
    return [newest] if newest else []


def deduplicate_glider_positions(records):
    """Use in snapshot assembly, after time filtering; keep separate exports."""
    result, indices = [], {}
    for record in records:
        identifier = record.get('wmo_id')
        if not identifier and re.fullmatch(r'glider:\d{7}', record.get('id', '')):
            identifier = record['id'].split(':')[1]
        if record.get('kind') != 'underwater' or not re.fullmatch(r'\d{7}', str(identifier or '')):
            result.append(record)
            continue
        if identifier not in indices:
            indices[identifier] = len(result)
            result.append(record)
        else:
            index = indices[identifier]
            if (record.get('observed_at') or 0) > (result[index].get('observed_at') or 0):
                result[index] = record
    return result


def fetch_voto(fetch_json=None, now=None):
    if fetch_json is None:
        from data_sources import fetch_json
    now = time.time() if now is None else now
    records = []
    # All-or-nothing refresh preserves prior valid data if a dataset request fails.
    for identifier in voto_datasets(fetch_json(voto_catalog_url(now)), now):
        meta = voto_metadata(fetch_json(VOTO_BASE + '/info/' + identifier + '/index.json'), identifier)
        records.extend(normalize_voto(fetch_json(voto_position_url(identifier)), meta, now))
    return deduplicate_glider_positions(records)
