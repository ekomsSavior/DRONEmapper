"""Validation fixtures stay in tests; they never enter the production feed."""
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from additional_sources import normalize_atlas, normalize_gliders, fetch_atlas

NOW = 1792083540

def atlas():
    return {'geometryType': 'esriGeometryPoint', 'spatialReference': {'wkid': 4326},
            'features': [{'attributes': {'AOSNUMBER': 'AOS999999', 'Agency': 'Validation Police',
                          'City': 'Validation City', 'Technology': 'Drones', 'Link_1_Date': '2020'},
                          'geometry': {'x': -80, 'y': 30}}]}

class AdditionalSources(unittest.TestCase):
    def test_agency_area_keeps_documentation_date_and_unknown_model(self):
        r = normalize_atlas(atlas())[0]
        self.assertEqual(r['record_type'], 'activity')
        self.assertIsNone(r['observed_at'])
        self.assertIsNone(r['model'])
        self.assertEqual(r['record_dates'], '2020')
        self.assertEqual(r['status'], 'documented-program')

    def test_atlas_excludes_other_technology_plans_and_invalid_coordinates(self):
        for change in ({'Technology': 'Body-worn Cameras'}, {'Summary': 'Plans to purchase drones'}):
            p = atlas(); p['features'][0]['attributes'].update(change)
            self.assertEqual(normalize_atlas(p), [])
        p = atlas(); p['features'][0]['geometry']['x'] = True
        self.assertEqual(normalize_atlas(p), [])
        p['spatialReference']['wkid'] = 3857
        with self.assertRaises(ValueError): normalize_atlas(p)

    def test_atlas_fetches_all_pages_or_fails_without_partial_replacement(self):
        p = atlas(); p['exceededTransferLimit'] = True
        q = atlas(); q['features'][0]['attributes']['AOSNUMBER'] = 'AOS999998'
        with patch('additional_sources.fetch_json', side_effect=[p, q]) as fetch:
            self.assertEqual(len(fetch_atlas()), 2)
            self.assertIn('resultOffset=1999', fetch.call_args.args[0])
        with patch('additional_sources.fetch_json', side_effect=[p, OSError('unavailable')]):
            with self.assertRaises(OSError): fetch_atlas()

    def test_glider_freshness_units_dedup_and_reported_position(self):
        stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat().replace('+00:00', 'Z')
        p = {'table': {'columnNames': ['platform_name', 'time', 'latitude', 'longitude'],
             'columnUnits': [None, 'UTC', 'degrees_north', 'degrees_east'], 'rows': [
             ['9999999', stamp(NOW-300), 20, -60], ['9999999', stamp(NOW-600), 21, -61],
             ['9999998', stamp(NOW-86401), 20, -60], ['9999997', stamp(NOW+60), 20, -60],
             ['9999996', 'invalidZ', 20, -60], ['9999995', stamp(NOW-300), True, -60]]}}
        rows = normalize_gliders(p, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['observed_at'], NOW-300)
        self.assertEqual(rows[0]['position_basis'], 'reported')
        self.assertIsNone(rows[0]['operator'])
        self.assertNotIn('speed_mps', rows[0])
        p['table']['columnUnits'][2] = 'radians'
        with self.assertRaises(ValueError): normalize_gliders(p, NOW)

if __name__ == '__main__': unittest.main()
