#!/usr/bin/env python3
"""Build offline model-bound radio references; never generate scanner heuristics."""
import argparse
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def artifacts():
    systems=json.loads((ROOT/'integration/device-systems.json').read_text())
    bands=json.loads((ROOT/'integration/rf-channels.json').read_text())['channels']
    profiles=[]
    for source in systems['profiles']:
        facts=[f for f in source['facts'] if f['section']=='radios']
        if not facts: continue
        profile={k:source[k] for k in ('id','manufacturer','models','configuration','reviewed_on')}
        for key in ('fcc_ids','record_bindings'):
            if key in source:profile[key]=source[key]
        profile['facts']=facts
        profile['rf_channels']=[b for b in bands if source['id'] in b.get('system_profile_ids','').split(';')]
        profiles.append(profile)
    profiles.sort(key=lambda p:(p['manufacturer'].casefold(),p['models'][0].casefold(),p['id']))
    data=json.dumps(dict(schema_version=1,notice='Published model and configuration references; shared bands do not identify a device. These facts are not received observations.',profiles=profiles),ensure_ascii=False,separators=(',',':'))+'\n'
    paths=['public/radio-references.json','android-node/app/src/main/assets/radio-references.json','linux-node/dronemapper_node/static/radio-references.json']
    return {p:data for p in paths}
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    for path,data in artifacts().items():
        if args.check:
            if not (ROOT/path).is_file() or (ROOT/path).read_text()!=data:raise SystemExit('Stale radio references: '+path)
        else:(ROOT/path).write_text(data)
    print('Shared radio references verified.' if args.check else 'Generated offline radio references for web, Android and desktop.')
