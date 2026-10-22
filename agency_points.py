"""Roselle's date-only public deployment log, with generalized operation areas."""
from datetime import datetime, timezone
import math
import re
import time
from urllib.parse import urlencode
from data_sources import finite, fetch_json

FIELDS='OBJECTID,Date_Text,USER_Date_,USER_Total_Duration_of_Flight,General_Category'

def point_revision(meta):
    if (meta.get('error') or meta.get('geometryType')!='esriGeometryPoint'
        or meta.get('objectIdField')!='OBJECTID'
        or meta.get('advancedQueryCapabilities',{}).get('supportsPagination') is not True
        or meta.get('dateFieldsTimeReference',{}).get('timeZone')!='UTC'):
        raise ValueError('Published operation schema changed')
    types={f['name']:f['type'] for f in meta.get('fields',[])}
    for key,kind in dict(OBJECTID='OID',Date_Text='String',USER_Date_='Date',USER_Total_Duration_of_Flight='String',General_Category='String').items():
        if types.get(key)!='esriFieldType'+kind:raise ValueError('Published operation fields changed')
    revision=meta.get('editingInfo',{}).get('lastEditDate')
    if not finite(revision,1,1e14):raise ValueError('Missing operation revision')
    return revision

def duration_minutes(value):
    m=re.fullmatch(r'(?:(\d+)\s*hours?\s*)?(?:(\d+)\s*mins?\s*)?',value.strip().lower()) if isinstance(value,str) else None
    if not m or not any(m.groups()):return None
    minutes=int(m[1] or 0)*60+int(m[2] or 0)
    return minutes if 0<minutes<=1440 else None

def normalize_operation_points(features,agency,now=None):
    now=time.time() if now is None else now
    if not isinstance(features,list):raise ValueError('Invalid operation features')
    records=[];seen=set()
    for f in features:
        p=f.get('attributes') or {};g=f.get('geometry') or {};oid=p.get('OBJECTID')
        if type(oid) is not int or not 0<=oid<=2**53-1 or oid in seen:raise ValueError('Invalid or repeated operation identifier')
        seen.add(oid);text=p.get('Date_Text');stamp=p.get('USER_Date_')
        m=re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})',text.strip()) if isinstance(text,str) else None
        if not m or not finite(stamp,946684800000,now*1000):continue
        day=f'{m[3]}-{m[1].zfill(2)}-{m[2].zfill(2)}'
        if datetime.fromtimestamp(stamp/1000,timezone.utc).date().isoformat()!=day:continue
        if not finite(g.get('x'),-180,180) or not finite(g.get('y'),-90,90) or g['x']==g['y']==0:continue
        west=math.floor(g['x']*100)/100;south=math.floor(g['y']*100)/100;east=round(west+.01,2);north=round(south+.01,2)
        if east>180 or north>90:continue
        purpose=p.get('General_Category');purpose=re.sub(r'[\x00-\x1f]',' ',purpose).strip()[:180] if isinstance(purpose,str) else ''
        records.append(dict(id=f"police-flight:{agency['id']}:{oid}",record_type='historical',status='published-flight',kind='drone',domain='air',name=agency['agency']+' operation · '+day,model=None,manufacturer=None,operator=agency['agency'],purpose='public-safety',latitude=round(south+.005,3),longitude=round(west+.005,3),flight_area=[south,west,north,east],place=agency['place'],event_date=day,record_dates=day,reported_duration_minutes=duration_minutes(p.get('USER_Total_Duration_of_Flight')),flight_purpose=purpose or 'Not reported',observed_at=None,live=False,precision='Published operation point generalized to a 0.01° area; date only, not aircraft GPS',source='police-'+agency['id'],source_url=agency['layer'],evidence_url=agency['official'],agency_portal=agency['portal'],attribution=agency['agency']+' / public drone deployment log',verification='Agency-published operation; original calendar date, launch time not supplied'))
    return records

def fetch_operation_points(agency,previous=None,fetch=fetch_json,now=None):
    now=time.time() if now is None else now;previous=previous or {}
    before=point_revision(fetch(agency['layer']+'?f=json',262144));revision=str(before)
    if previous.get('source_revision')==revision and isinstance(previous.get('records'),list):return {**previous,'refresh_after':agency['refresh_seconds']}
    count=fetch(agency['layer']+'/query?'+urlencode(dict(f='json',where='1=1',returnCountOnly='true')),65536)
    if count.get('error') or type(count.get('count')) is not int or count['count']<0:raise ValueError('Invalid operation count')
    target=min(count['count'],agency['max_records']);features=[]
    for offset in range(0,target,1000):
        size=min(1000,target-offset)
        q=dict(f='json',where='1=1',outFields=FIELDS,outSR='4326',returnGeometry='true',geometryPrecision='3',orderByFields='USER_Date_ DESC,OBJECTID DESC',resultOffset=offset,resultRecordCount=size)
        batch=fetch(agency['layer']+'/query?'+urlencode(q),2000000)
        if batch.get('error') or batch.get('spatialReference',{}).get('wkid')!=4326 or not isinstance(batch.get('features'),list) or len(batch['features'])!=size:raise ValueError('Incomplete operation page')
        features.extend(batch['features'])
    if point_revision(fetch(agency['layer']+'?f=json',262144))!=before:raise ValueError('Operation layer changed during collection')
    records=normalize_operation_points(features,agency,now)
    if target and not records:raise ValueError('No usable operation dates or areas')
    return dict(records=records,source_revision=revision,refresh_after=agency['refresh_seconds'],coverage=dict(published_rows=count['count'],selected_rows=target,mapped_records=len(records),filtered_or_duplicate_rows=target-len(records),omitted_rows=count['count']-target,window_days=None,record_limit=agency['max_records']))
