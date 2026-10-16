import unittest
from argo_source import COLUMNS, UNITS, normalize_argo, argo_url, stamp


class ArgoTests(unittest.TestCase):
    now = stamp('2026-10-16T12:00:00Z')

    def row(self):
        return ['1900001', 'APEX', '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z', -40, 80, '1', '1', 'GPS']

    def payload(self, rows):
        return {'table': {'columnNames': COLUMNS, 'columnUnits': list(UNITS), 'rows': rows}}

    def test_newest_surface_fix_and_no_inferred_identity(self):
        early = self.row()
        early[3] = '2026-10-16T09:00:00Z'
        records = normalize_argo(self.payload([early, self.row(), self.row()]), self.now)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['observed_at'], stamp(self.row()[3]))
        self.assertEqual(records[0]['kind'], 'profiling-float')
        self.assertIsNone(records[0]['manufacturer'])
        self.assertIn('underwater position unknown', records[0]['precision'])
        self.assertIn('time%3E=2026-10-15T12:00:00Z', argo_url(self.now))

    def test_excludes_bad_interpolated_stale_future_and_nonfinite(self):
        for index, value in [(6, '8'), (6, '2'), (7, '0'), (8, 'UNKNOWN'), (3, None),
                             (3, '2026-10-17T00:00:00Z'), (3, '2026-10-14T12:00:00Z'),
                             (2, '2026-10-17T00:00:00Z'), (4, float('nan')), (5, 181), (0, 'invalid')]:
            with self.subTest(index=index, value=value):
                row = self.row()
                row[index] = value
                self.assertEqual(normalize_argo(self.payload([row]), self.now), [])

    def test_schema_change_is_rejected(self):
        data = self.payload([self.row()])
        data['table']['columnUnits'][4] = 'radians'
        with self.assertRaises(ValueError):
            normalize_argo(data, self.now)
        with self.assertRaises(ValueError):
            normalize_argo(self.payload([self.row()[1:]]), self.now)
