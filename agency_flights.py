"""Agency-published flight envelopes. Shares the website's reviewed source registry."""
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from data_sources import fetch_json, finite
from agency_points import fetch_operation_points

AGENCIES = json.loads((Path(__file__).parent/'public/police-flight-sources.json').read_text())
FIELDS = 'ObjectId,flight_id,takeoff,landing,flight_purpose'
UUID = re.compile(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$', re.I)

def layer_revision(meta):
    if (meta.get('error') or meta.get('geometryType') != 'esriGeometryPolyline'
        or meta.get('objectIdField') != 'ObjectId'
        or ((meta.get('extent') or {}).get('spatialReference') or meta.get('spatialReference') or {}).get('wkid') != 4326
        or meta.get('advancedQueryCapabilities', {}).get('supportsReturningGeometryEnvelope') is not True):
        raise ValueError('Published flight schema changed')
    types = {f['name']: f['type'] for f in meta.get('fields', [])}
    for key, kind in {'ObjectId':'OID','flight_id':'String','takeoff':'Date','landing':'Date','flight_purpose':'String'}.items():
        if types.get(key) != 'esriFieldType'+kind:
            raise ValueError('Published flight fields changed')
    revision = meta.get('editingInfo', {}).get('lastEditDate')
    if not finite(revision, 1, 1e14):
        raise ValueError('Missing published flight revision')
    return revision

def normalize_agency_flights(features, agency, now=None):
    now = time.time() if now is None else now
    if not isinstance(features, list):
        raise ValueError('Invalid public flight features')
    records, seen, conflicts = {}, set(), set()
    for feature in features:
        p, g = feature.get('attributes') or {}, feature.get('envelope') or {}
        oid, fid = p.get('ObjectId'), p.get('flight_id')
        if type(oid) is not int or not 0 <= oid <= 2**53-1 or oid in seen or not isinstance(fid,str) or not UUID.fullmatch(fid):
            raise ValueError('Invalid or repeated public flight identifier')
        seen.add(oid)
        start, end = p.get('takeoff'), p.get('landing')
        if not finite(start,946684800000,now*1000) or not finite(end,start,now*1000) or end-start>86400000:
            continue
        if agency.get('window_days') and start<(now-agency['window_days']*86400)*1000:
            continue
        if not (finite(g.get('xmin'),-180,180) and finite(g.get('xmax'),g['xmin'],180)
                and finite(g.get('ymin'),-90,90) and finite(g.get('ymax'),g['ymin'],90)):
            continue
        if g['xmax']-g['xmin']>5 or g['ymax']-g['ymin']>5:
            continue
        west,east = math.floor(g['xmin']*1000)/1000,math.ceil(g['xmax']*1000)/1000
        south,north = math.floor(g['ymin']*1000)/1000,math.ceil(g['ymax']*1000)/1000
        if not any([west,east,south,north]):
            continue
        day=datetime.fromtimestamp(start/1000,timezone.utc).date().isoformat()
        purpose=p.get('flight_purpose')
        purpose=re.sub(r'[\x00-\x1f]',' ',purpose).strip()[:180] if isinstance(purpose,str) else ''
        record=dict(id=f"police-flight:{agency['id']}:{fid}",record_type='historical',status='published-flight',kind='drone',domain='air',name=agency['agency']+' flight · '+day,model=None,manufacturer=None,operator=agency['agency'],purpose=agency.get('purpose','public-safety'),operator_type=agency.get('operator_type','police'),reporting_platform=agency.get('reporting_platform','Skydio'),latitude=round((south+north)/2,4),longitude=round((west+east)/2,4),flight_area=[south,west,north,east],place=agency['place'],event_date=day,record_dates=day,flight_started_at=start/1000,flight_ended_at=end/1000,reported_duration_minutes=math.floor((end-start)/6000+.5)/10,flight_purpose=purpose or 'Not reported',observed_at=None,live=False,precision='Published flight envelope; generalized area, not aircraft GPS or incident address',source='police-'+agency['id'],source_url=agency['layer'],evidence_url=agency['official'],agency_portal=agency['portal'],attribution=agency['agency']+' / public flight transparency dashboard',verification='Agency-published completed flight; publication timing controlled by the agency')
        if record['id'] in records and records[record['id']] != record:
            conflicts.add(record['id'])
        else:
            records[record['id']]=record
    return [r for key,r in records.items() if key not in conflicts]

def fetch_agency_flights(agency, previous=None, fetch=fetch_json, now=None):
    if agency.get('format')=='roselle-points':
        return fetch_operation_points(agency,previous,fetch,now)
    now=time.time() if now is None else now
    previous=previous or {}
    before=layer_revision(fetch(agency['layer']+'?f=json',262144))
    revision=f"2:{before}:{math.floor(now/86400) if agency.get('window_days') else 0}"
    if previous.get('source_revision')==revision and isinstance(previous.get('records'),list):
        return dict(records=previous['records'],source_revision=revision,refresh_after=agency['refresh_seconds'],coverage=previous.get('coverage'))
    where='landing IS NOT NULL'
    if agency.get('window_days'):
        cutoff=datetime.fromtimestamp(now-agency['window_days']*86400,timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        where+=f" AND takeoff >= TIMESTAMP '{cutoff}'"
    count=fetch(agency['layer']+'/query?'+urlencode(dict(f='json',where=where,returnCountOnly='true')),65536)
    if count.get('error') or type(count.get('count')) is not int or count['count']<0:
        raise ValueError('Invalid public flight count')
    target=min(count['count'],agency['max_records']); features=[]; seen=set()
    for offset in range(0,target,1000):
        size=min(1000,target-offset)
        query=dict(f='json',where=where,outFields=FIELDS,outSR='4326',returnGeometry='false',returnEnvelope='true',geometryPrecision='3',resultRecordCount=size,resultOffset=offset,orderByFields='takeoff DESC,ObjectId DESC')
        batch=fetch(agency['layer']+'/query?'+urlencode(query),2000000)
        if batch.get('error') or batch.get('spatialReference',{}).get('wkid')!=4326 or not isinstance(batch.get('features'),list) or len(batch['features'])!=size:
            raise ValueError('Incomplete public flight page')
        for feature in batch['features']:
            oid=feature.get('attributes',{}).get('ObjectId')
            if oid in seen:
                raise ValueError('Repeated public flight page')
            seen.add(oid)
        features.extend(batch['features'])
    if layer_revision(fetch(agency['layer']+'?f=json',262144))!=before:
        raise ValueError('Published flight layer changed during collection')
    records=normalize_agency_flights(features,agency,now)
    if target and not records:
        raise ValueError('No usable public flight dates or areas')
    return dict(records=records,source_revision=revision,refresh_after=agency['refresh_seconds'],coverage=dict(published_rows=count['count'],selected_rows=target,mapped_records=len(records),filtered_or_duplicate_rows=target-len(records),omitted_rows=count['count']-target,window_days=agency.get('window_days'),record_limit=agency['max_records']))
