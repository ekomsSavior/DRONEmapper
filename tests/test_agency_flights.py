import copy
import json
from pathlib import Path
import subprocess
import unittest
from urllib.parse import urlsplit, parse_qs
from agency_flights import AGENCIES, fetch_agency_flights, normalize_agency_flights, layer_revision

ROOT=Path(__file__).resolve().parents[1]
F=json.loads((ROOT/'tests/fixtures/agency-flight-envelopes.json').read_text())
A=next(a for a in AGENCIES if a['id']==F['agency_id'])

class AgencyFlightTests(unittest.TestCase):
    def test_real_envelopes_match_browser_collector(self):
        records=normalize_agency_flights(F['features'], A,F['now'])
        self.assertTrue(records)
        code="import fs from 'node:fs';import {agencies,normalizeAgencyFlights} from './worker/agency-flights.mjs';const f=JSON.parse(fs.readFileSync('tests/fixtures/agency-flight-envelopes.json'));console.log(JSON.stringify(normalizeAgencyFlights(f.features,agencies.find(a=>a.id===f.agency_id),f.now)))"
        js=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True))
        self.assertEqual(records,js)
        self.assertTrue(all(r['live'] is False and r['observed_at'] is None for r in records))
    def test_fetch_cache_and_failed_pages(self):
        calls=[]
        def fetch(url,limit):
            calls.append(url);q=parse_qs(urlsplit(url).query)
            if 'returnCountOnly' in q:return {'count':len(F['features'])}
            if urlsplit(url).path.endswith('/query'):return {'features':F['features'],'spatialReference':{'wkid':4326}}
            return F['metadata']
        result=fetch_agency_flights(A,fetch=fetch,now=F['now'])
        self.assertEqual(result['coverage']['selected_rows'],len(F['features']))
        calls.clear();cached=fetch_agency_flights(A,result,fetch,F['now'])
        self.assertEqual(result,cached);self.assertEqual(len(calls),1)
        def incomplete(url,limit):
            result=fetch(url,limit)
            return {**result,'features':[]} if 'features' in result else result
        with self.assertRaisesRegex(ValueError,'Incomplete'):
            fetch_agency_flights(A,fetch=incomplete,now=F['now'])
    def test_duplicate_and_conflicting_records(self):
        f=copy.deepcopy(F['features'][0]);duplicate=copy.deepcopy(f);duplicate['attributes']['ObjectId']+=1000000
        self.assertEqual(len(normalize_agency_flights([f,duplicate],A,F['now'])),1)
        duplicate['attributes']['flight_purpose']='Conflicting purpose'
        self.assertEqual(normalize_agency_flights([f,duplicate],A,F['now']),[])
        with self.assertRaises(ValueError):normalize_agency_flights([f,f],A,F['now'])
        meta=copy.deepcopy(F['metadata']);meta['fields']=[]
        with self.assertRaisesRegex(ValueError,'fields changed'):layer_revision(meta)
    def test_empty_extent_and_operator_category(self):
        meta=copy.deepcopy(F['metadata']);meta['extent']=None;meta['spatialReference']={'wkid':4326}
        self.assertIsNotNone(layer_revision(meta))
        meta['spatialReference']['wkid']=3857
        with self.assertRaises(ValueError):layer_revision(meta)
        a={**A,'operator_type':'utility','purpose':'commercial'}
        records=normalize_agency_flights(F['features'],a,F['now'])
        self.assertTrue(all(r['operator_type']=='utility' and r['purpose']=='commercial' and not r['live'] for r in records))
