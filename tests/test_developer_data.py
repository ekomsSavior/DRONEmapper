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

    def test_oui_retains_every_original_prefix_and_registrant(self):
        original=dict(line.split('\t',1) for line in (ROOT/'android-node/app/src/main/assets/oui-vendors.tsv').read_text().splitlines())
        rows=list(csv.DictReader(io.StringIO(self.artifacts['oui-global.csv'].decode())))
        unescape=lambda s:s[1:] if s.startswith("'") else s
        self.assertEqual({r['prefix']:unescape(r['registrant']) for r in rows},original)
        self.assertEqual({int(r['prefix_bits']) for r in rows},{24,28,36})
        for r in rows:
            self.assertEqual(len(r['prefix'])*4,int(r['prefix_bits']))
            self.assertEqual(r['evidence_scope'],'registrant-only')

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

    def test_csv_is_reversible_and_not_spreadsheet_executable(self):
        cases=['=1+1','  =1+1','+cmd','-cmd','@SUM(1)',"'literal",'\tformula','line,quote"\nnext']
        rows=list(csv.DictReader(io.StringIO(export.csv_bytes(['text'],[{'text':s} for s in cases]).decode())))
        for src,row in zip(cases,rows):
            text=row['text']
            self.assertEqual(text[1:] if text.startswith("'") else text,src)
            self.assertNotIn(text.lstrip()[:1],('=','+','-','@'))

if __name__=='__main__':unittest.main()
