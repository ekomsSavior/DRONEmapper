import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("compile_faa", ROOT / "scripts/compile_faa_evidence.py")
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)
from reviewed_history import fetch_history, normalize_history
from server import Collector, Handler, ThreadingHTTPServer


def matches(value, rule):
    return (len(value) == len(rule["start"]) and rule["start"] <= value <= rule["end"]
            and (not rule.get("decimal_suffix") or value[-rule["decimal_suffix"]:].isdigit()))


class EnrichmentTests(unittest.TestCase):
    def test_local_browser_all_time_filter_returns_history_and_retained_positions(self):
        with tempfile.TemporaryDirectory() as directory:
            collector = Collector(Path(directory), adapters={})
            collector.providers["test"] = {"records": fetch_history() + [
                {"id": "position-test", "record_type": "position", "observed_at": 900},
                {"id": "future-test", "record_type": "position", "observed_at": 1100},
                {"id": "expired-test", "record_type": "position", "observed_at": -90000},
            ]}
            self.assertEqual([r["id"] for r in collector.snapshot(0, current=1000)["tracks"]],
                             ["position-test"])
            collector.providers["test"]["records"] = fetch_history()
            httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            httpd.collector = collector
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                base = f"http://127.0.0.1:{httpd.server_port}"
                for suffix in ("", "?hours=0", "?hours=336"):
                    with urlopen(base + "/feed" + suffix) as response:
                        self.assertEqual(len(json.load(response)["activity"]), 43)
                with self.assertRaises(HTTPError) as caught:
                    urlopen(base + "/feed?hours=nan")
                self.assertEqual(caught.exception.code, 400)
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=2)

    def test_incremental_catalog_import_preserves_review_and_rejects_non_rid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('worker', 'docs', 'evidence'):
                (root / name).mkdir()
            catalog = root / 'worker/rid-catalog.mjs'
            catalog.write_text('export const rules = [];\n')
            review = root / 'docs/faa-enrichment-review.json'
            review.write_text(json.dumps([{'tracking': 'RID000000999', 'decision': 'deferred'}]))
            record = dict(tracking='RID000000001', makeName='Fixture', modelName='Aircraft',
                docType='rid', status='accepted', certificationTypeId=1,
                evidence_url='https://uasdoc.faa.gov/listDocs/RID000000001', reviewed_at='2026-10-20',
                revisions=[dict(id='first', sha256='0'*64, allocations=['18179300000000-181793FFFFFFFF'])])
            (root / 'evidence/RID000000001.json').write_text(json.dumps(record))
            rejected = dict(record, tracking='RID000000002', status='rescinded',
                evidence_url='https://uasdoc.faa.gov/listDocs/RID000000002')
            (root / 'evidence/RID000000002.json').write_text(json.dumps(rejected))
            with patch.object(compiler, 'ROOT', root), patch('sys.argv', ['compile', str(root / 'evidence')]):
                compiler.main()
                first = catalog.read_text()
                compiler.main()
            self.assertEqual(catalog.read_text(), first)
            decisions = {r['tracking']: r['decision'] for r in json.loads(review.read_text())}
            self.assertEqual(decisions['RID000000001'], 'included')
            self.assertTrue(decisions['RID000000002'].startswith('excluded'))
            self.assertEqual(decisions['RID000000999'], 'deferred')

    def test_compaction_does_not_fill_serial_gaps_or_accept_letters_in_numeric_runs(self):
        values = [f"1839FTD502932332{n:04d}" for n in list(range(1, 51)) + list(range(60, 81))]
        rules = compiler.compact(values)
        self.assertEqual(len(rules), 2)
        for number in range(0, 100):
            serial = f"1839FTD502932332{number:04d}"
            self.assertEqual(any(matches(serial, r) for r in rules), serial in values)
        for serial in ("1839FTD502932332000A", "1839FTD5029323320055"):
            self.assertFalse(any(matches(serial, r) for r in rules))

    def test_cta_alphabet_contiguous_values_keep_holes(self):
        values = ["1587A057000300" + c for c in compiler.ALPHABET if c != "Q"]
        rules = compiler.compact(values)
        for c in compiler.ALPHABET:
            serial = "1587A057000300" + c
            self.assertEqual(any(matches(serial, r) for r in rules), serial in values)

    def test_bad_allocations_and_non_rid_are_excluded(self):
        r = dict(status="accepted", docType="rid", certificationTypeId=2,
                 makeName="Fixture", modelName="Module", evidence_url="https://uasdoc.faa.gov/listDocs/RID000000001",
                 reviewed_at="2026-10-20", revisions=[{"allocations": ["18179300000000-181793FFFFFFFF", "bad", "18189300000000-181793FFFFFFFF"]}])
        rules, count = compiler.compile_declaration(r)
        self.assertEqual(count, 2)
        self.assertEqual(rules[0]["device_type"], "module")
        for change in ({"docType": "oop"}, {"status": "rescinded"}, {"certificationTypeId": 99}):
            with self.assertRaises(ValueError):
                compiler.compile_declaration(dict(r, **change))

    def test_robot_history_keeps_original_dates_and_area_precision(self):
        rows = {r['id']: r for r in fetch_history()}
        self.assertEqual(rows['milestone:spf-changi-patrol-2023']['record_dates'], '2023-04')
        self.assertEqual(rows['milestone:anymal-pery-inspections-2025']['record_dates'], '2025-01')
        for key in ('anymal-pery-inspections-2025', 'anymal-itabira-inspection-report-2021', 'anymal-slough-demo-report-2025'):
            row = rows['milestone:' + key]
            self.assertEqual(row['kind'], 'robot-dog')
            self.assertEqual(row['position_basis'], 'reported-area')
            self.assertIsNone(row['observed_at'])

    def test_history_parity_and_no_current_positions(self):
        rows = fetch_history()
        js = subprocess.check_output(["node", "--input-type=module", "-e",
            "import {historicalMilestones as r} from './worker/reviewed-history.mjs';console.log(JSON.stringify(r))"],
            cwd=ROOT, text=True)
        self.assertEqual(rows, json.loads(js))
        self.assertEqual(len({r["id"] for r in rows}), 43)
        for row in rows:
            self.assertEqual(row["record_type"], "historical")
            self.assertIsNone(row["observed_at"])
            self.assertNotIn("live", row)
            self.assertNotIn("trail", row)
        payload = json.loads((ROOT / "docs/reviewed-history.json").read_text())
        for field, bad in (("date", "2099"), ("date", "2022-02-30"), ("latitude", 91), ("evidence_url", "javascript:bad")):
            changed = copy.deepcopy(payload)
            changed["events"][0][field] = bad
            with self.assertRaises(ValueError):
                normalize_history(changed)


if __name__ == "__main__":
    unittest.main()
