import copy
import json
from pathlib import Path
import subprocess
import unittest
from urllib.parse import urlsplit,parse_qs
from agency_flights import AGENCIES,fetch_agency_flights
from agency_points import normalize_operation_points,duration_minutes

ROOT=Path(__file__).resolve().parents[1]
F=json.loads((ROOT/'tests/fixtures/roselle-operations.json').read_text())
A=next(a for a in AGENCIES if a['id']=='roselle')

class OperationTests(unittest.TestCase):
    def test_real_data_matches_worker(self):
        records=normalize_operation_points(F['features'],A,F['now'])
        code="import fs from 'node:fs';import {agencies} from './worker/agency-flights.mjs';import {normalizeOperationPoints} from './worker/agency-points.mjs';const f=JSON.parse(fs.readFileSync('tests/fixtures/roselle-operations.json'));console.log(JSON.stringify(normalizeOperationPoints(f.features,agencies.find(a=>a.id==='roselle'),f.now)))"
        js=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True))
        self.assertEqual(len(records),3);self.assertEqual(records,js)
    def test_real_fetch_cache_and_partial_failure(self):
        calls=[]
        def fetch(url,limit):
            calls.append(url);q=parse_qs(urlsplit(url).query)
            if 'returnCountOnly' in q:return {'count':3}
            if urlsplit(url).path.endswith('/query'):return {'features':F['features'],'spatialReference':{'wkid':4326}}
            return F['metadata']
        r=fetch_agency_flights(A,fetch=fetch,now=F['now']);self.assertEqual(len(r['records']),3)
        calls.clear();self.assertEqual(fetch_agency_flights(A,r,fetch,F['now']),r);self.assertEqual(len(calls),1)
        def bad(url,limit):
            r=fetch(url,limit)
            return {**r,'features':[]} if 'features' in r else r
        with self.assertRaisesRegex(ValueError,'Incomplete'):fetch_agency_flights(A,fetch=bad,now=F['now'])
    def test_invalid_dates_identity_and_duration(self):
        x=copy.deepcopy(F['features'][0]);x['attributes']['Date_Text']='2/30/2026'
        self.assertEqual(normalize_operation_points([x],A,F['now']),[])
        with self.assertRaises(ValueError):normalize_operation_points([F['features'][0]]*2,A,F['now'])
        self.assertEqual(duration_minutes('1 hour 30 mins'),90);self.assertEqual(duration_minutes('2 hours'),120)
        self.assertIsNone(duration_minutes('about 20 min'))
