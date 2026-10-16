import copy
import json
from pathlib import Path
import unittest
from ioos_source import ioos_datasets, ioos_metadata, ioos_position_url, normalize_ioos, fetch_ioos
from voto_source import stamp, deduplicate_glider_positions

F=json.loads((Path(__file__).parent/'fixtures/ioos-spray.json').read_text())
NOW=stamp('2026-10-16T20:00:00Z')

class IOOSTest(unittest.TestCase):
    def meta(self):
        return ioos_metadata(copy.deepcopy(F['metadata']), F['dataset_id'])

    def test_surface_fix(self):
        r=normalize_ioos(F['position'], self.meta(), NOW)[0]
        self.assertEqual(r['id'], 'ioos:4802946')
        self.assertEqual(r['observed_at'], stamp('2026-10-16T16:26:00Z'))
        self.assertEqual(r['position_method'], 'surface-gps')
        self.assertEqual(r['latitude'], 34.3853)
        self.assertEqual(r['license'], 'CC BY 4.0')
        self.assertIn('Scripps', r['attribution'])

    def test_invalid_reports(self):
        for i,v in [(0,'9999999'),(1,'2026-10-14T12:00:00Z'),(1,'2026-10-17T12:00:00Z'),
                    (1,'2026-10-16T16:26:00'),(2,91),(2,None),(3,181),(4,2),(4,True)]:
            with self.subTest(i=i,v=v):
                p=copy.deepcopy(F['position']); p['table']['rows'][0][i]=v
                self.assertEqual(normalize_ioos(p,self.meta(),NOW),[])
        p=copy.deepcopy(F['position']);p['table']['columnUnits'][2]='radians'
        with self.assertRaises(ValueError): normalize_ioos(p,self.meta(),NOW)

    def test_metadata(self):
        for var,attr,val in [('gps_end_qc','flag_meanings','bad good'),('gps_end_lat','comment','Interpolated profile midpoint'),
                             ('NC_GLOBAL','license','All rights reserved'),('platform','id','sp099')]:
            p=copy.deepcopy(F['metadata'])
            next(r for r in p['table']['rows'] if r[1]==var and r[2]==attr)[4]=val
            with self.assertRaises(ValueError): ioos_metadata(p,F['dataset_id'])
        with self.assertRaises(ValueError): ioos_position_url('../other')

    def test_catalog_bounds_and_freshness(self):
        p={'table':{'columnNames':['datasetID','title','maxTime'],'rows':[
            [F['dataset_id'],'Spray','2026-10-16T16:26:00Z'],
            ['sg148-20260722T1939','Seaglider','2026-10-16T16:26:00Z'],
            ['sp099-20260101T0000','old','2026-01-01T00:00:00Z']]}}
        self.assertEqual(ioos_datasets(p,NOW),[F['dataset_id']])
        p['table']['rows']=[[f'sp{i:03d}-20261012T1606','Spray','2026-10-16T16:26:00Z'] for i in range(33)]
        with self.assertRaises(ValueError): ioos_datasets(p,NOW)

    def test_fetch_failure_and_shared_identity(self):
        catalog={'table':{'columnNames':['datasetID','title','maxTime'],'rows':[[F['dataset_id'],'Spray','2026-10-16T16:26:00Z']]}}
        def fetch(url):
            return catalog if 'allDatasets' in url else F['metadata'] if '/info/' in url else F['position']
        records=fetch_ioos(fetch,NOW)
        self.assertEqual(len(records),1)
        older={**records[0],'id':'glider:4802946','observed_at':records[0]['observed_at']-60}
        self.assertEqual(deduplicate_glider_positions([older]+records),records)
        def fail(url):
            if '/info/' in url: raise ValueError('unavailable')
            return catalog
        with self.assertRaises(ValueError): fetch_ioos(fail,NOW)
