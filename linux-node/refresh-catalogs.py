#!/usr/bin/env python3
"""Rebuild Linux factual lookup assets from the repository's reviewed catalogs."""
import hashlib
import json
from pathlib import Path
import re
import shutil

root=Path(__file__).resolve().parent.parent
target=root/'linux-node/dronemapper_node/data'
text=(root/'worker/rid-catalog.mjs').read_text()
match=re.search(r'export const rules\s*=\s*(\[.*\])\s*;',text,re.S)
if not match:
    raise SystemExit('FAA catalog layout changed; review it before refreshing')
rules=json.loads(match[1])
required={'start','end','manufacturer','model','device_type'}
allowed=required|{'evidence_url','reviewed_at'}
if not isinstance(rules,list) or not rules or any(not isinstance(row,dict) or not required<=row.keys() or row.keys()-allowed for row in rules):
    raise SystemExit('FAA catalog schema changed; review before refreshing')
target.mkdir(parents=True,exist_ok=True)
(target/'rid-catalog.json').write_text(json.dumps(rules,ensure_ascii=False,indent=2)+'\n')
assets=root/'android-node/app/src/main/assets'
provenance=json.loads((assets/'oui-vendors-provenance.json').read_text())
vendors=(assets/'oui-vendors.tsv').read_bytes()
if hashlib.sha256(vendors).hexdigest()!=provenance['sha256']:
    raise SystemExit('OUI catalog digest does not match its recorded provenance')
for name in ('oui-vendors.tsv','oui-vendors-provenance.json'):
    shutil.copyfile(assets/name,target/name)
print(f'Refreshed {len(rules)} FAA serial ranges and {provenance["prefix_count"]} OUI allocations.')
