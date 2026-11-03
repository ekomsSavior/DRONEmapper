#!/usr/bin/env python3
"""Deterministic public CSV exports of the reviewed DRONEmapper catalogs.

No network requests, private research inputs, observations or credentials.
Run --check in CI to detect stale downloads without changing files.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/downloads/data'
SCHEMA_VERSION=1

def sha(data):
    return hashlib.sha256(data).hexdigest()

def csv_bytes(fields, rows):
    stream=io.StringIO(newline='')
    writer=csv.DictWriter(stream,fieldnames=fields,lineterminator='\r\n',extrasaction='raise')
    writer.writeheader()
    for row in rows:
        # Reversible spreadsheet escaping: prefix one apostrophe when text begins
        # with a formula marker, control whitespace, or an apostrophe itself.
        clean={k:("'"+v if isinstance(v,str) and (v.startswith(("'",'\t','\r','\n')) or v.lstrip().startswith(('=','+','-','@'))) else v) for k,v in row.items()}
        writer.writerow(clean)
    return stream.getvalue().encode('utf-8')

def catalog_rules():
    text=(ROOT/'worker/rid-catalog.mjs').read_text()
    return json.loads(re.search(r'export const rules\s*=\s*(\[.*\])\s*;',text,re.S)[1])

def scoped_oui():
    data=json.loads((ROOT/'integration/device-oui.json').read_text())
    rows=data['allocations']
    if len({r['prefix'] for r in rows})!=len(rows):
        raise ValueError('Duplicate scoped device allocation')
    for r in rows:
        if not re.fullmatch(r'[0-9A-F]{6}|[0-9A-F]{7}|[0-9A-F]{9}',r['prefix']) or len(r['prefix'])*4!=r['prefix_bits']:
            raise ValueError('Invalid scoped device allocation')
    return data

def oui_rows():
    rows=[]
    for r in scoped_oui()['allocations']:
        prefix=r['prefix']
        # Keep full MA-M / MA-S masks; never broaden them to a 24-bit OUI.
        if r['prefix_bits']==24:
            oui=':'.join(prefix[i:i+2] for i in range(0,6,2))
        else:
            padded=prefix.ljust(12,'0')
            oui=':'.join(padded[i:i+2] for i in range(0,12,2))+'/'+str(r['prefix_bits'])
        rows.append(dict(device=r['device'],oui=oui))
    return sorted(rows,key=lambda r:(r['device'].casefold(),r['oui']))

def rid_rows():
    from compile_faa_evidence import valid_serial
    rows=[]
    for r in catalog_rules():
        start,end=r['start'],r['end'];width=r.get('decimal_suffix',0)
        if not (valid_serial(start) and valid_serial(end) and len(start)==len(end) and start<=end):
            raise ValueError('Invalid bounded Remote ID allocation')
        if width and (type(width) is not int or not 0<width<=len(start)-5 or start[:-width]!=end[:-width] or not start[-width:].isdigit() or not end[-width:].isdigit()):
            raise ValueError('Invalid decimal suffix guard')
        if not re.fullmatch(r'https://uasdoc\.faa\.gov/listDocs/RID[0-9]+',r['evidence_url']):
            raise ValueError('Remote ID export requires a declaration evidence URL')
        identity={k:r.get(k) for k in ('manufacturer','model','device_type','start','end','decimal_suffix','evidence_url')}
        rows.append(dict(rule_id=sha(json.dumps(identity,sort_keys=True).encode())[:24],manufacturer=r['manufacturer'],model=r['model'],device_type=r['device_type'],manufacturer_code=start[:4],length_code=start[4],serial_start=start,serial_end=end,serial_length=len(start),decimal_suffix=width,evidence_url=r['evidence_url'],reviewed_at=r['reviewed_at'],identity_authenticated='false'))
    return sorted(rows,key=lambda r:(r['manufacturer'],r['model'],r['serial_start'],r['serial_end'],r['rule_id']))

def rf_rows():
    rows=json.loads((ROOT/'integration/rf-channels.json').read_text())['channels']
    seen=set()
    for r in rows:
        if r['id'] in seen:raise ValueError('Duplicate RF entry')
        seen.add(r['id'])
        if not r['source'].startswith('https://'):raise ValueError('RF source URL required')
        center=r['frequency_mhz'];lo=r['range_start_mhz'];hi=r['range_end_mhz']
        if center is None:
            if not isinstance(lo,(int,float)) or not isinstance(hi,(int,float)) or not 0<lo<hi:raise ValueError('Invalid RF range')
        elif not isinstance(center,(int,float)) or center<=0 or lo is not None or hi is not None:
            raise ValueError('Do not conflate frequency centers and band edges')
    return sorted(rows,key=lambda r:r['id'])

def artifacts():
    collections=[('oui-global.csv',oui_rows()),('rid-prefixes.csv',rid_rows()),('rf-channels.csv',rf_rows())]
    outputs={}
    entries=[]
    for name,rows in collections:
        data=csv_bytes(list(rows[0]),rows);outputs[name]=data
        entries.append(dict(file=name,url='/downloads/data/'+name,rows=len(rows),bytes=len(data),sha256=sha(data),columns=list(rows[0])))
    global_data=global_devices(collections)
    data=(json.dumps(global_data,ensure_ascii=False,indent=2)+'\n').encode()
    outputs['devices-global.json']=data
    entries.append(dict(file='devices-global.json',url='/downloads/data/devices-global.json',rows=len(global_data['devices']),bytes=len(data),sha256=sha(data),collections=global_data['counts']))
    inputs=['integration/device-oui.json','worker/rid-catalog.mjs','integration/security-device-references.json','integration/rf-channels.json','integration/fcc-references.json','integration/robot-platforms.json','integration/robot-signatures.json','integration/aircraft-references.json','integration/drone-platforms.json','integration/cloud-surfaces.json','public/device-inventory.json','docs/device-links.json','scripts/export_device_catalog.mjs','scripts/export_developer_data.py','scripts/device_radio_export.py']
    manifest=dict(schema_version=SCHEMA_VERSION,release=scoped_oui()['reviewed_on'],encoding='UTF-8',line_endings='CRLF',delimiter=',',scope='Drone, autonomous-vehicle, robot and associated equipment research. MAC allocations are restricted to explicitly reviewed relevant manufacturers.',datasets=entries,inputs=[dict(path=p,sha256=sha((ROOT/p).read_bytes())) for p in inputs],upstream_rights='See README.md and upstream sources; no blanket relicensing of third-party material.')
    outputs['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    outputs['SHA256SUMS.txt']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(outputs.items())).encode()
    return outputs

def global_devices(collections):
    """Keep evidence layers intact; never fuzzy-merge a module into a vehicle."""
    website=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/export_device_catalog.mjs')],cwd=ROOT,text=True))
    read=lambda p:json.loads((ROOT/p).read_text())
    fcc=read('integration/fcc-references.json')
    rid=collections[1][1]
    rows=[]
    def identity(maker,name,kind):
        return 'device-'+sha(json.dumps([maker.casefold(),name.casefold(),kind],ensure_ascii=False).encode())[:24]
    for m in website['models']:
        kind='catalog-device-or-program'
        rows.append({**m,'catalog_id':identity(m['maker'],m['name'],kind),'kind':kind,'remote_id_rule_ids':[]})
    # Separate declaration/model references when the exact manufacturer/model is
    # absent. No substring matching and no manufacturer-only model inference.
    for rule in rid:
        model=next((m for m in rows if m['kind']!='regulatory-equipment' and m['maker'].casefold()==rule['manufacturer'].casefold() and rule['model'].casefold() in [str(n).casefold() for n in [m['name'],m.get('model'),*m.get('aliases',[])]]),None)
        if model is None:
            kind='remote-id-declaration-model'
            model=dict(catalog_id=identity(rule['manufacturer'],rule['model'],kind),kind=kind,maker=rule['manufacturer'],name=rule['model'],category='remote-id-module' if rule['device_type']=='module' else 'drone',catalog_evidence='reviewed-remote-id-rule',remote_id_rule_ids=[],sources=[])
            rows.append(model)
        model['remote_id_rule_ids'].append(rule['rule_id'])
        model['sources']=sorted(set([*model.get('sources',[]),rule['evidence_url']]))
    for record in fcc['devices']:
        rows.append({**record,'catalog_id':'equipment-'+record['fcc_id'],'name':record['product'],'category':'radio-equipment','catalog_evidence':record['evidence_status']})
    # Product associations are their own evidence records, not guessed mergers.
    rows.sort(key=lambda r:(r['maker'].casefold(),r['name'].casefold(),r['catalog_id']))
    if len({r['catalog_id'] for r in rows})!=len(rows):raise ValueError('Duplicate global catalog identities')
    oui=[{**r,'evidence_scope':'manufacturer-only'} for r in scoped_oui()['allocations']]
    result=dict(schema_version=1,release=scoped_oui()['reviewed_on'],scope='Complete snapshot of the included DRONEmapper catalogs and contributed equipment index. Not an exhaustive inventory of all products worldwide; evidence status is field-specific.',map_inventory_generated_at=website['map_inventory_generated_at'],devices=rows,
        radio_allocations=oui,radio_allocation_provenance={k:v for k,v in scoped_oui().items() if k!='allocations'},
        remote_id_rules=rid,rf_channels=collections[2][1],robot_signatures=read('integration/robot-signatures.json'),
        cloud_services=read('integration/cloud-surfaces.json'),vendor_flows=website['flows'],
        equipment_vendors=fcc['vendors'],equipment_product_relationships=fcc['product_relationships'],equipment_input_provenance=fcc['inputs'],
        device_links=read('docs/device-links.json'),
        catalog_references={n:read('integration/'+n+'.json') for n in ('robot-platforms','aircraft-references','security-device-references','drone-platforms')})
    from device_radio_export import enrich_radio
    enrich_radio(rows,oui,result['catalog_references'],result['robot_signatures'],result['rf_channels'],fcc,scoped_oui().get('manufacturer_aliases',{}))
    result['counts']={k:len(result[k]) for k in ('devices','radio_allocations','remote_id_rules','rf_channels','vendor_flows','equipment_product_relationships')}
    result['counts'].update(cloud_services=len(result['cloud_services']['services']),robot_signatures=len(result['robot_signatures']['rules']),fcc_equipment=len(fcc['devices']),devices_with_mac_allocations=sum(bool(d['mac_allocations']) for d in rows),devices_with_rf_information=sum(bool(d['rf_information']) for d in rows),devices_with_scanner_signatures=sum(bool(d['scanner_signatures']) for d in rows))
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    results=artifacts()
    if args.check:
        stale=[name for name,data in results.items() if not (OUT/name).is_file() or (OUT/name).read_bytes()!=data]
        if stale:raise SystemExit('Stale developer data: '+', '.join(stale))
        print('Developer CSVs and checksums match all reviewed catalogs.')
    else:
        OUT.mkdir(parents=True,exist_ok=True)
        for name,data in results.items():(OUT/name).write_bytes(data)
        for row in json.loads(results['manifest.json'])['datasets']:print(row['file'],row['rows'],'rows',row['bytes'],'bytes')

if __name__=='__main__':main()
