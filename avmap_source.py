"""Public AV Map documented driverless service areas; never vehicle positions."""
import csv, io, json, math, re
from datetime import datetime, timezone
from urllib.parse import quote

URL='https://raw.githubusercontent.com/path-avmap/av-map-data/main/events.csv'
UPDATES={'geometry_updated':'geometry_file','vehicle_types_updated':'vehicles','platform_updated':'platform','fares_policy_changed':'fares','access_policy_changed':'access','supervision_updated':'supervision','fleet_partner_changed':'fleet_partner','direct_booking_updated':'direct_booking','service_model_updated':'service_model'}
LIFECYCLE={'service_testing','service_announced','service_created'}
FIELDS=['date','event_type','company','city','geometry_file','vehicles','platform','fares','direct_booking','service_model','supervision','access','fleet_partner','expected_launch','company_link','booking_platform_link','source_url','notes']
GENERIC={'north america','south america','europe','asia','africa','global','worldwide','various','multiple locations'}

def eligible(state):
    return state['status']=='service_created' and state.get('supervision')=='Autonomous' and state.get('access') in ('Public','Waitlist') and state['city'].lower() not in GENERIC

def replay(text, day, include_history=False):
    if len(text)>2_000_000: raise ValueError('Oversized AV Map CSV')
    reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    if reader.fieldnames!=FIELDS: raise ValueError('Changed AV Map schema')
    rows=list(reader)
    if len(rows)>10000: raise ValueError('Too many AV Map rows')
    states={}
    history={}
    for row in sorted(rows,key=lambda r:r.get('date','')):
        if None in row or any(v is None for v in row.values()):raise ValueError('Malformed AV Map row')
        row={k:v.strip() for k,v in row.items()}
        date=row['date']
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):continue
        try: datetime.strptime(date,'%Y-%m-%d')
        except ValueError:continue
        if date>day or not row['company'] or not row['city']:continue
        key=row['company']+'|'+row['city'];typ=row['event_type']
        if typ in LIFECYCLE:
            # Following the source cache, lifecycle events merge supplied fields.
            prior=states.get(key,{})
            states[key]={**prior,**{k:v for k,v in row.items() if v},'status':typ,'last_event':date}
        elif key in states:
            state=states[key]
            if typ=='service_ended':
                if eligible(state) and state.get('driverless_since'):
                    history[key+'|'+state['driverless_since']+'|'+date]={
                        **state,'status':'service_ended','ended_at':date,'last_event':date,
                        'source_url':row['source_url'] or state.get('source_url','')}
                state['status']=typ
            elif typ in UPDATES and row[UPDATES[typ]]:
                # Crucially, unrelated nonempty cells do not replace fields.
                state[UPDATES[typ]]=row[UPDATES[typ]]
            else:continue
            state['last_event']=date
        state=states.get(key)
        if state is not None:
            state['driverless_since']=(state.get('driverless_since') or date) if eligible(state) else None
    return [s for s in states.values() if eligible(s)]+(list(history.values()) if include_history else [])

def geometry_files(states):
    return sorted({s['geometry_file'] for s in states if re.fullmatch(r'[a-zA-Z0-9_-]+\.geojson',s.get('geometry_file',''))})

def position(value, geometries):
    if re.fullmatch(r'-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?',value or ''):
        lon,lat=map(float,value.split(','))
        if -180<=lon<=180 and -90<=lat<=90 and (lon or lat):return lon,lat,'Published city point; not a vehicle position'
        return None
    obj=geometries.get(value)
    if not obj:return None
    positions=[]
    def walk(g):
        if not isinstance(g,dict):return False
        typ=g.get('type')
        if typ=='FeatureCollection':return bool(g.get('features')) and all(walk(f) for f in g['features'])
        if typ=='Feature':return walk(g.get('geometry'))
        if typ not in ('Polygon','MultiPolygon'):return False
        coords=g.get('coordinates')
        if not isinstance(coords,list):return False
        polygons=coords if typ=='MultiPolygon' else [coords]
        for poly in polygons:
            if not isinstance(poly,list) or not poly:return False
            for ring in poly:
                if not isinstance(ring,list) or len(ring)<4:return False
                for p in ring:
                    if not isinstance(p,list) or len(p)<2:return False
                    lon,lat=p[:2]
                    if isinstance(lon,bool) or isinstance(lat,bool) or not isinstance(lon,(int,float)) or not isinstance(lat,(int,float)) or not math.isfinite(lon) or not math.isfinite(lat) or not -180<=lon<=180 or not -90<=lat<=90:return False
                    positions.append((lon,lat))
        return True
    if not walk(obj) or not positions:return None
    xs,ys=zip(*positions)
    if max(xs)-min(xs)>10 or max(ys)-min(ys)>10:return None
    return (min(xs)+max(xs))/2,(min(ys)+max(ys))/2,'Service-area bounding-box center; not a vehicle position'

def normalize(text,geometries,day):
    records=[]
    for s in replay(text,day,True):
        p=position(s.get('geometry_file',''),geometries)
        if not p:continue
        company=s['company'];city=s['city']
        ended=s['status']=='service_ended'
        key=company+'|'+city+('|' + s['driverless_since']+'|'+s['ended_at'] if ended else '')
        record={'id':('avmap-history:' if ended else 'avmap:')+quote(key,safe="-_.!~*'()"),'record_type':'historical' if ended else 'activity','kind':'autonomous-vehicle','domain':'ground','name':company+(' — ended driverless service' if ended else ' — driverless service'),'model':None,'manufacturer':None,'operator':company,'purpose':'unknown','latitude':p[1],'longitude':p[0],'place':city,'status':'historical-service' if ended else 'documented-program','observed_at':None,'record_dates':s['driverless_since']+' — '+s['ended_at'] if ended else s['last_event'],'precision':p[2],'source':'avmap','source_url':URL,'evidence_url':'https://avmap.io/','attribution':'AV Map contributors / Jackson Lester','license':'MIT','license_url':'https://github.com/path-avmap/av-map-data/blob/main/LICENSE','verification':'Previously documented driverless service; end recorded by AV Map' if ended else 'Documented driverless service area; continued operation unverified'}
        if ended:
            record.update(service_started=s['driverless_since'],service_ended=s['ended_at'],summary='AV Map records the end of this previously launched driverless service.')
            if s.get('source_url','').startswith('https://'):record['evidence_url']=s['source_url']
        records.append(record)
    return records



def fetch_avmap():
    from concurrent.futures import ThreadPoolExecutor
    from data_sources import fetch_text, fetch_json
    day = datetime.now(timezone.utc).date().isoformat()
    text = fetch_text(URL, 2_000_000)
    files = geometry_files(replay(text, day, True))
    if len(files) > 50:
        raise ValueError('AV Map geometry limit')
    with ThreadPoolExecutor(max_workers=3) as pool:
        geometries = dict(zip(files, pool.map(lambda name: fetch_json('https://raw.githubusercontent.com/path-avmap/av-map-data/main/geometries/' + name), files)))
    return normalize(text, geometries, day)
