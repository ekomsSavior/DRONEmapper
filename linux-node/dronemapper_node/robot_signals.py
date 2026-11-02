"""Published broadcast clues, never authenticated robot identity. AGPL-3.0-or-later."""
import json
import re
from pathlib import Path

CATALOG = json.loads((Path(__file__).parent / 'data/robot-signatures.json').read_text())
RULES = {r['id']: r for r in CATALOG['rules']}
CYBERDOG_UUID = RULES['cyberdog-ble-v1']['service_uuid']
CYBERDOG_SIGNATURE = 'cyberdog-ble-v1'


def robot_rule(signature):
    return RULES.get(signature)


def wifi_robot_signature(name):
    if not isinstance(name, str):
        return None
    return next((r['id'] for r in RULES.values() if r['transport'] == 'wifi'
                 and re.fullmatch(r['name_pattern'], name)), None)


def robot_signature(name, service_uuids, manufacturer_data):
    if not isinstance(name, str):
        return None
    for r in RULES.values():
        if r['transport'] != 'ble' or not re.fullmatch(r['name_pattern'], name):
            continue
        if r.get('service_uuid') and r['service_uuid'] not in {str(x).lower() for x in service_uuids}:
            continue
        if 'manufacturer_id' in r and manufacturer_data.get(r['manufacturer_id']) != bytes.fromhex(r['manufacturer_hex']):
            continue
        return r['id']
    return None
