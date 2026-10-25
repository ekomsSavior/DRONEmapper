#!/usr/bin/env python3
"""Copy reviewed device facts to both offline scanners; never create sightings."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
source = root / 'integration/security-device-references.json'
data = json.loads(source.read_text(encoding='utf-8'))
assert data['schema_version'] == 1
for path in ('android-node/app/src/main/assets/security-device-references.json',
             'linux-node/dronemapper_node/data/security-device-references.json'):
    (root / path).write_bytes(source.read_bytes())
print('Synced offline security-device references to Android and desktop.')
