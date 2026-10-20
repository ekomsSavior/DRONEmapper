"""Reviewed public FAA serial allocation regression tests; no RF transmission."""
import unittest
from dronemapper_node.engine import Catalog


class CatalogTest(unittest.TestCase):
    def test_new_model_matches_and_numeric_gaps(self):
        catalog = Catalog()
        def identify(serial):
            return catalog.identify(serial.encode().hex().ljust(40, '0'), 1)
        self.assertEqual(identify('1839FTD5029323320001')['model'], 'Teal 2')
        self.assertEqual(identify('1914CL2D233900001')['model'], 'LEMUR 2')
        self.assertEqual(identify('18735P2721')['model'], 'P2 Zip')
        self.assertEqual(identify('1656DTYR14MBD00001')['model'], 'Trinity R14')
        self.assertEqual(identify('1839FTD502932332000A'), {})
        self.assertEqual(identify('1839FTD5029323320501'), {})
        module = identify('18179300000000')
        self.assertIn('Remote ID Upgrade Kit (Alta X)', module['module'])
        self.assertNotIn('model', module)
