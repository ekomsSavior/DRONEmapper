"""Export integrity: full corpus coverage, lossless identities and honest scope."""
import csv
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import export_developer_data as export

class DeveloperDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifacts=export.artifacts()
        cls.global_data=json.loads(cls.artifacts['devices-global.json'])

    def test_deterministic_downloads_and_checksums(self):
        for name,data in self.artifacts.items():
            self.assertEqual(data,(export.OUT/name).read_bytes(),name)
        for line in self.artifacts['SHA256SUMS.txt'].decode().splitlines():
            digest,name=line.split('  ')
            self.assertEqual(digest,export.sha(self.artifacts[name]))
        manifest=json.loads(self.artifacts['manifest.json'])
        for entry in manifest['datasets']:
            self.assertEqual(entry['sha256'],export.sha(self.artifacts[entry['file']]))

    def test_oui_is_only_the_scoped_two_column_device_list(self):
        rows=list(csv.DictReader(io.StringIO(self.artifacts['oui-global.csv'].decode())))
        self.assertEqual(list(rows[0]),['device','oui'])
        reviewed=export.scoped_oui()['allocations']
        self.assertEqual(len(rows),len(reviewed))
        self.assertEqual({r['device'] for r in rows},{r['device'] for r in reviewed})
        self.assertEqual(self.global_data['counts']['radio_allocations'],len(rows))
        self.assertLess(len(rows),1000)
        by_device={r['device']:r['oui'] for r in rows}
        self.assertEqual(by_device['Anduril Industries devices'],'E8:B4:70:C0:00:00/28')
        self.assertEqual(by_device['Anduril Imaging devices'],'8C:1F:64:76:30:00/36')
        for unrelated in ['Cisco','Apple','Intel','U.S. Robotics','Data Robotics','Nurotron','Autelan','Tesla Controls','Tesla Subsea','YAMAHA CORPORATION']:
            self.assertFalse(any(r['device'].casefold().startswith(unrelated.casefold()+' ') for r in rows),unrelated)
        for name,data in self.artifacts.items():
            self.assertNotIn(b'ringmast4r',data.lower(),name)
            self.assertNotIn(b'oui-master-database',data.lower(),name)
        for r in reviewed:
            self.assertEqual(len(r['prefix'])*4,r['prefix_bits'])
            self.assertTrue(r['source'].startswith('https://standards-oui.ieee.org/'))

    def test_serial_rules_are_not_broadened_or_dropped(self):
        original=export.catalog_rules()
        rows=list(csv.DictReader(io.StringIO(self.artifacts['rid-prefixes.csv'].decode())))
        key=lambda r:(r['manufacturer'],r['model'],r['device_type'],r['start'],r['end'],r.get('decimal_suffix',0),r['evidence_url'])
        restored=[dict(manufacturer=r['manufacturer'],model=r['model'],device_type=r['device_type'],start=r['serial_start'],end=r['serial_end'],decimal_suffix=int(r['decimal_suffix']),evidence_url=r['evidence_url']) for r in rows]
        self.assertCountEqual([key(r) for r in original],[key(r) for r in restored])
        self.assertEqual(len({r['rule_id'] for r in rows}),len(rows))
        joined=[rid for d in self.global_data['devices'] for rid in d.get('remote_id_rule_ids',[])]
        self.assertCountEqual(joined,[r['rule_id'] for r in rows])
        self.assertTrue(all(r['identity_authenticated']=='false' for r in rows))

    def test_full_shared_catalog_and_each_contributed_file_are_represented(self):
        bridge=json.loads(subprocess.check_output(['node','scripts/export_device_catalog.mjs'],cwd=ROOT,text=True))
        exported=self.global_data['devices']
        for row in bridge['models']:
            self.assertTrue(any(d['maker']==row['maker'] and d['name']==row['name'] for d in exported),(row['maker'],row['name']))
        fcc=json.loads((ROOT/'integration/fcc-references.json').read_text())
        self.assertEqual({d['fcc_id'] for d in fcc['devices']},{d['fcc_id'] for d in exported if d['kind']=='regulatory-equipment'})
        self.assertEqual({Path(r['path']).name for r in self.global_data['equipment_input_provenance']},{'waymo.json','skydio.json','nuro.json','us-drones.json'})
        self.assertEqual(len({d['catalog_id'] for d in exported}),len(exported))
        for name,original in self.global_data['catalog_references'].items():
            self.assertEqual(original,json.loads((ROOT/'integration'/f'{name}.json').read_text()))

    def test_device_radio_information_keeps_model_and_vendor_scope(self):
        devices=self.global_data['devices']
        get=lambda maker,name:next(r for r in devices if r['maker']==maker and r['name']==name)
        for d in devices:
            for key in ('mac_allocations','rf_information','scanner_signatures'):
                self.assertIsInstance(d[key],list)
        spot=get('Boston Dynamics','Spot')
        self.assertEqual({r['prefix'] for r in spot['mac_allocations']},{'10364A','70B3D5292'})
        self.assertTrue(all('not verified for this particular model' in r['scope'] for r in spot['mac_allocations']))
        go1=get('Unitree Robotics','Unitree Go1')
        self.assertEqual([r['id'] for r in go1['scanner_signatures']],['unitree-go1-wifi-name'])
        self.assertEqual(get('Unitree Robotics','Unitree Go2')['scanner_signatures'],[])
        self.assertEqual(get('Petoi','Quaddle')['scanner_signatures'],[])
        self.assertEqual(go1['mac_allocations'],[])
        cyberdog=get('Xiaomi','CyberDog')
        band=next(r for r in cyberdog['rf_information'] if r['kind']=='protocol-channel-reference')
        self.assertEqual([c['frequency_mhz'] for c in band['channels']],[2402,2426,2480])
        x10=get('Skydio','Skydio X10')
        variant=next(r for r in x10['rf_information'] if r['kind']=='manufacturer-listed-radio-variant')
        self.assertIn('RI7FN990A40',variant['fcc_ids'])
        self.assertNotIn('2ATQRA40',variant['fcc_ids'])
        telit=next(d for d in devices if d['catalog_id']=='equipment-RI7FN990A40')
        self.assertEqual(telit['mac_allocations'],[])
        self.assertEqual(telit['rf_information'][0]['frequencies_mhz'],[])
        waymo=next(d for d in devices if d['catalog_id']=='equipment-2AZKTRADE8C')
        self.assertIn('pending',waymo['rf_information'][0]['evidence_status'])
        self.assertEqual(waymo['rf_information'][0]['frequencies_mhz'],[[79036,80978]])

    def test_researched_configurations_without_map_records_are_exported(self):
        devices=self.global_data['devices']
        # These previously existed only in system_profiles and on the website,
        # but were absent from the flat devices collection used by developers.
        for maker,name in [('ACSL','PF4'),('ACUA Ocean','Pioneer Mk2'),('AeiROBOT','ALICE 5')]:
            device=next(d for d in devices if d['maker']==maker and d['name']==name)
            self.assertEqual(device['catalog_evidence'],'reviewed-system-configuration')
            self.assertTrue(device['system_breakdown']['configurations'])
            self.assertFalse(device.get('records'))
            self.assertFalse(device['scanner_signatures'])
        profiles=self.global_data['system_profiles']['profiles']
        equipment={d['fcc_id'] for d in devices if d['kind']=='regulatory-equipment'}
        for profile in profiles:
            self.assertTrue(set(profile.get('fcc_ids',[]))<=equipment,profile['id'])
        represented={c['id'] for d in devices for c in d['system_breakdown']['configurations']}
        self.assertEqual(represented,{p['id'] for p in profiles})

    def test_frequency_and_evidence_semantics(self):
        rows={r['id']:r for r in self.global_data['rf_channels']}
        self.assertEqual(rows['ble-37']['frequency_mhz'],2402)
        self.assertEqual(rows['ble-38']['frequency_mhz'],2426)
        self.assertEqual(rows['ble-39']['frequency_mhz'],2480)
        self.assertIsNone(rows['ble-37']['bandwidth_mhz'])
        self.assertEqual(rows['ble-37']['channel_spacing_mhz'],2)
        sys.path.insert(0,str(ROOT/'linux-node'))
        from dronemapper_node.storage import BANDS
        for band,bounds in BANDS.items():
            row=rows['spectrum-'+band]
            self.assertEqual([row['range_start_mhz'],row['range_end_mhz']],list(bounds))
        for r in self.global_data['devices']:
            if r['kind']=='regulatory-equipment':self.assertIs(r['scanner_signature'],False)
        x10=next(r for r in self.global_data['equipment_product_relationships'] if r['product']=='Skydio X10 (online)')
        self.assertIn('RI7FN990A40',x10['fcc_ids'])
        self.assertNotIn('2ATQRA40',x10['fcc_ids'])

    def test_reviewed_module_components_are_in_export_without_host_inference(self):
        equipment={d['fcc_id']:d for d in self.global_data['devices'] if d['kind']=='regulatory-equipment'}
        relabel=equipment['2ATQRA40']
        self.assertEqual(relabel['product'],'Telit FN990A40 (Skydio relabel)')
        self.assertEqual(relabel['contributed_product'],'Fibocom FN990A40')
        self.assertEqual(relabel['mac_allocations'],[])
        self.assertEqual(relabel['scanner_signatures'],[])
        self.assertEqual(relabel['system_breakdown']['record_scope'],'regulatory-equipment')
        self.assertIn('Snapdragon X65',json.dumps(relabel['system_breakdown']['sections']['compute']))
        smodb=equipment['2ATQRSMODBV3S']['system_breakdown']
        self.assertEqual([r['id'] for r in smodb['configurations']],['skydio-smodbv3s-module'])
        self.assertEqual(smodb['sections']['compute']['status'],'not-established')
        ca=equipment['2ATQRCA']['system_breakdown']
        self.assertIn('QCS6490',json.dumps(ca['sections']['compute']))
        self.assertEqual(equipment['2ATQRCA']['scanner_signatures'],[])
        zipline=equipment['2BML6P2EV1-0']['system_breakdown']
        self.assertIn('Bluetooth and 5 GHz are disabled',json.dumps(zipline['sections']['radios']))

    def test_system_radio_facts_and_frequency_rows_join_only_exact_profiles(self):
        devices=self.global_data['devices']
        mini=next(d for d in devices if d['maker']=='DJI' and d['name']=='DJI Mini 4 Pro')
        bands=next(r for r in mini['rf_information'] if r['kind']=='model-frequency-reference')['channels']
        self.assertEqual({b['system_profile_ids'] for b in bands},{'dji-mini4pro'})
        self.assertEqual([(b['range_start_mhz'],b['range_end_mhz']) for b in bands],[(2400,2483.5),(5170,5250),(5725,5850)])
        self.assertTrue(any(r.get('profile_id')=='dji-mini4pro' for r in mini['rf_information']))
        self.assertEqual(mini['scanner_signatures'],[])
        rows={r['id']:r for r in self.global_data['rf_channels']}
        for lo,hi,spacing in [(2412,2462,5),(5745,5825,20)]:
            r=rows[f'model-parrot-anafi-ai-{lo}-{hi}']
            self.assertEqual(r['observation_kind'],'channel-center-range')
            self.assertEqual(r['channel_spacing_mhz'],spacing)
            self.assertIsNone(r['bandwidth_mhz'])
        for d in devices:
            ids={c['id'] for c in d['system_breakdown']['configurations']}
            for r in d['rf_information']:
                if r['kind']=='system-radio-reference':self.assertIn(r['profile_id'],ids)
                if r['kind']=='model-frequency-reference':
                    for b in r['channels']:self.assertTrue(ids.intersection(b['system_profile_ids'].split(';')))

    def test_csv_is_reversible_and_not_spreadsheet_executable(self):
        cases=['=1+1','  =1+1','+cmd','-cmd','@SUM(1)',"'literal",'\tformula','line,quote"\nnext']
        rows=list(csv.DictReader(io.StringIO(export.csv_bytes(['text'],[{'text':s} for s in cases]).decode())))
        for src,row in zip(cases,rows):
            text=row['text']
            self.assertEqual(text[1:] if text.startswith("'") else text,src)
            self.assertNotIn(text.lstrip()[:1],('=','+','-','@'))

if __name__=='__main__':unittest.main()
