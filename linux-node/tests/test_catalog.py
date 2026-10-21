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

    def test_additional_public_allocations_and_ambiguous_models(self):
        catalog = Catalog()
        def identify(serial):
            return catalog.identify(serial.encode().hex().ljust(40, '0'), 1)
        for serial, model in [
            ('1644FMD4100000007004', 'md4-1000'),
            ('18088FDA972B6', 'Commander3 XL'),
            ('1886BSKY20002000', 'SKY II'),
            ('1634FS0TEN2600A02715', 'SOTEN'),
            ('18106M22010', 'M2'),
            ('16355A9551', 'Hummingbird v2'),
        ]:
            with self.subTest(serial=serial):
                self.assertEqual(identify(serial)['model'], model)
        # Accepted M2 and M2 Block 2 declarations overlap: never choose one.
        self.assertEqual(identify('18106M22021'), {})
        self.assertEqual(identify('1634FS0TEN2600A0271A'), {})
