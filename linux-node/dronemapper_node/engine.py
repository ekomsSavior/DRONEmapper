"""Stationary node event pipeline and local display. AGPL-3.0-or-later."""
import hashlib
import hmac
import json
import math
from pathlib import Path
import re
import statistics
import threading
import time
import uuid
from .account import Connection, Uploader
from .protocol import AIRFRAMES, bearing_distance, finite, messages, MAC
from . import radios, __version__


class Catalog:
    def __init__(self):
        data=Path(__file__).with_name('data')
        self.rules=json.loads((data/'rid-catalog.json').read_text(encoding='utf-8')) if (data/'rid-catalog.json').exists() else []
        self.oui={}
        if (data/'oui-vendors.tsv').exists():
            for line in (data/'oui-vendors.tsv').read_text(encoding='utf-8').splitlines():
                prefix,sep,name=line.partition('\t')
                if sep:
                    self.oui[prefix.upper()]=name

    def vendor(self,mac):
        raw=mac.replace(':','').upper()
        if int(raw[:2],16)&2:
            return 'Locally administered address · vendor unknown'
        for length in (9,7,6):
            if raw[:length] in self.oui:
                return self.oui[raw[:length]]
        return 'Unknown radio vendor'

    def identify(self,rid,id_type):
        if id_type!=1:
            return {}
        raw=bytes.fromhex(rid)
        serial=raw.rstrip(b'\0').decode('ascii',errors='replace')
        if not re.fullmatch('[0-9A-HJ-NP-Z]{6,20}',serial) or serial[4] not in '0123456789ABCDEF' or int(serial[4],16)!=len(serial)-5:
            return {}
        matches={(r['manufacturer'],r['model'],r['device_type']) for r in self.rules
                 if len(r['start'])==len(serial)==len(r['end']) and r['start']<=serial<=r['end']
                 and (not r.get('decimal_suffix') or re.fullmatch('[0-9]+',serial[-r['decimal_suffix']:]))}
        if len(matches)!=1:
            return {}
        manufacturer,model,kind=matches.pop()
        if kind=='module':
            return {'module':manufacturer+' '+model,'identification':'Broadcast module match; aircraft unknown'}
        return {'manufacturer':manufacturer,'model':model,'identification':'Reported serial range match; identity unverified'}


class Engine:
    def __init__(self,store,api=None):
        self.store=store
        self.connection=Connection(store,api)
        self.uploader=Uploader(store,api)
        self.catalog=Catalog()
        self.lock=threading.RLock()
        self.control=threading.Lock()
        self.stop_event=threading.Event()
        self.quit_event=threading.Event()
        self.threads=[]
        self.running=False
        self.contacts={}
        self.states={}
        self.spectrum={}
        self.last_queued={}
        self.frame_count=0
        self.message_count=0
        self.decoded_count=0
        self.account_status=''
        self.background=threading.Thread(target=self._maintenance,daemon=True)
        self.background.start()

    def radio_status(self,name,text):
        with self.lock:
            self.states[name]=str(text)[:240]

    def _receiver(self,name,fn,args,stop):
        while not stop.is_set():
            try:
                fn(*args,stop,self.ingest,lambda text:self.radio_status(name,text))
            except Exception as error:
                self.radio_status(name,f'{type(error).__name__}: {error}')
            if stop.wait(15):
                break

    def start(self):
        with self.control:
            if self.running:
                return
            if any(t.is_alive() for t in self.threads):
                raise ValueError('Receivers are still stopping; retry shortly')
            config=self.store.settings()
            receivers=[('Wi-Fi '+x,radios.wifi,(x,)) for x in config['wifi_interfaces']]
            if config['ble_adapter']:
                receivers.append(('Bluetooth',radios.ble,(config['ble_adapter'],)))
            if config['sdr']!='off':
                if config['sdr_mode']=='adsb':
                    receivers.append(('SDR decoder',radios.adsb,(config['sdr'],)))
                elif config['sdr_mode']=='dji':
                    receivers.append(('DJI decoder',radios.dji,(config['dji_frequency'],)))
                else:
                    receivers.append(('SDR',radios.sdr,(config['sdr'],config['sdr_band'])))
            if config['readsb_file']:
                receivers.append(('ADS-B feed',radios.readsb_feed,(config['readsb_file'],)))
            if config['mqtt_file']:
                receivers.append(('MQTT',radios.mqtt,(config['mqtt_file'],)))
            if not receivers:
                raise ValueError('Choose at least one receiver in Radio settings')
            self.stop_event=threading.Event()
            self.states={name:'Starting receiver' for name,_,_ in receivers}
            self.running=True
            self.threads=[threading.Thread(target=self._receiver,args=(name,fn,args,self.stop_event),daemon=True) for name,fn,args in receivers]
            for thread in self.threads:
                thread.start()

    def stop(self):
        with self.control:
            self.running=False
            self.stop_event.set()
            for thread in self.threads:
                thread.join(timeout=2)
            with self.lock:
                self.states={name:'Stopped' for name in self.states}

    def configure(self,values):
        # Radio configuration changes require a stopped receiver; consent can change live.
        old=self.store.settings()
        radio_keys={'wifi_interfaces','ble_adapter','sdr','sdr_band','sdr_mode','dji_frequency','readsb_file','mqtt_file'}
        if self.running and any(values.get(k,old[k])!=old[k] for k in radio_keys):
            raise ValueError('Stop listening before changing receivers')
        self.store.update({**old,**values})

    def _maintenance(self):
        while not self.quit_event.wait(1):
            try:
                self.connection.poll()
                self.account_status=''
                if self.running:
                    self.uploader.tick()
            except Exception:
                self.account_status='Account service unavailable · retrying'

    def ingest(self,event):
        with self.lock:
            if self.quit_event.is_set():
                return
            now=time.time()
            kind=event.get('type')
            if kind=='frame':
                self.frame_count+=1
                return
            if kind=='spectrum':
                for item in event['bins']:
                    self.spectrum[round(item['frequency_mhz'],6)]={**item,'seen':now}
                self.spectrum={k:v for k,v in sorted(self.spectrum.items(),key=lambda x:x[1]['seen'],reverse=True)[:2048] if now-v['seen']<20}
                return
            received=event.get('received_at')
            if not finite(received,now-120,now+5):
                return
            source=event['source']
            if kind=='decoded':
                # Separate contact/transport; never reinterpret ADS-B as Remote ID.
                if (event.get('protocol'),event.get('verification')) not in (('adsb','readsb-decoded'),('dji-droneid','crc-valid')):
                    return
                key=event['protocol']+'|'+event['device_id']
                if event.get('observed_at',0)<self.contacts.get(key,{}).get('observed_at',0):
                    return
                self.contacts[key]={**event,'key':key,'seen':received,
                    'kind':'drone' if event['unmanned'] else 'aircraft',
                    'local_only':not event['unmanned']}
                if event['unmanned']:
                    self._queue_decoded(key,event)
                self.decoded_count+=1
                self.last_queued={k:v for k,v in self.last_queued.items() if now-v[0]<900}
                self.contacts={k:v for k,v in sorted(self.contacts.items(),key=lambda p:p[1]['seen'],reverse=True)[:200] if now-v['seen']<=120}
                return
            mac=event.get('mac')
            receiver_id=event.get('receiver_id')
            if isinstance(mac,str) and MAC.fullmatch(mac):
                identity={'mac':mac,'radio_vendor':self.catalog.vendor(mac)}
                address=mac
            elif kind=='rid' and isinstance(receiver_id,str):
                try: address=str(uuid.UUID(receiver_id))
                except ValueError: return
                identity={'receiver_id':address}
            else:
                return
            key=source+'|'+address+('|candidate' if kind=='candidate' else '|rid')
            entry=self.contacts.setdefault(key,{'key':key,'source':source,**identity})
            entry.update(seen=received)
            if finite(event.get('rssi_dbm'),-127,20):
                entry['rssi_dbm']=event['rssi_dbm']
            if kind=='candidate':
                entry.update(kind='possible-drone',name='Possible drone / camera link',ssid=event['name'],signature=event['signature'])
                if finite(event.get('frequency_mhz'),2400,5900):
                    entry['frequency_mhz']=int(event['frequency_mhz'])
                self._queue(key,entry,received)
            elif kind=='rid':
                decoded=messages(event['payload'],received)
                if not decoded:
                    self.contacts.pop(key,None) if 'kind' not in entry else None
                    return
                self.message_count+=len(decoded)
                ids=[m for m in decoded if m['type']=='id']
                if ids:
                    identity=min(ids,key=lambda m:0 if m['id_type']==1 else m['id_type'])
                    if (entry.get('rid'),entry.get('id_type'))!=(identity['rid'],identity['id_type']):
                        for field in ('latitude','longitude','observed_at','altitude_m','speed_mps','heading','manufacturer','model','module','identification'):
                            entry.pop(field,None)
                    entry.update({k:v for k,v in identity.items() if k!='type'})
                    entry.update(self.catalog.identify(identity['rid'],identity['id_type']))
                    entry['id_seen']=received
                if 'rid' not in entry or received-entry.get('id_seen',0)>60:
                    self.contacts.pop(key,None)
                    return
                entry.update(kind='drone',name='Drone · '+entry.get('model',AIRFRAMES[entry['aircraft_type']]),protocol=event['protocol'])
                for loc in decoded:
                    if loc['type']=='location':
                        if loc['observed_at']<entry.get('observed_at',0):
                            continue
                        for field in ('altitude_m','speed_mps','heading'):
                            entry.pop(field,None)
                        entry.update({k:v for k,v in loc.items() if k!='type'})
                        self._queue(key,entry,received)
            self.contacts={k:v for k,v in sorted(self.contacts.items(),key=lambda p:p[1]['seen'],reverse=True)[:200] if now-v['seen']<=120}
            self.last_queued={k:v for k,v in self.last_queued.items() if now-v[0]<900}

    def _queue_decoded(self,key,event):
        stamp,received=event['observed_at'],event['received_at']
        last=self.last_queued.get(key,(0,0))
        if stamp<=last[1] or received-last[0]<5 or not -5<=received-stamp<=120:
            return
        record={'event_id':str(uuid.uuid4()),'received_at':received,'observed_at':stamp,
                'latitude':event['latitude'],'longitude':event['longitude']}
        if event['protocol']=='adsb':
            record.update(observation_type='adsb-uas',protocol='adsb',icao=event['device_id'].lower(),category='B6')
        else:
            record.update(observation_type='dji-droneid',protocol='dji-droneid',device_id=event['device_id'],model_code=event['model_code'],verification='crc-valid',frequency_mhz=event['frequency_mhz'])
        for field in ('altitude_m','speed_mps','heading','rssi_dbfs'):
            if field in event: record[field]=event[field]
        self.store.add(record,self.store.settings()['share_decoded'])
        self.last_queued[key]=(received,stamp)

    def _queue(self,key,entry,received):
        candidate=entry['kind']=='possible-drone'
        stamp=received if candidate else entry.get('observed_at')
        last=self.last_queued.get(key,(0,0))
        if stamp is None or stamp<=last[1] or received-last[0]<5:
            return
        settings=self.store.settings()
        record={'event_id':str(uuid.uuid4()),'received_at':received,'observed_at':stamp}
        if candidate:
            if settings['station'] is None or 'frequency_mhz' not in entry:
                return
            lat,lon=(round(math.floor(c*100)/100+.005,3) for c in settings['station'])
            # Node-specific stable pseudonym; neither full MAC nor network name is uploaded.
            digest=hmac.new(bytes.fromhex(self.store.config['secret']),entry['mac'].encode(),hashlib.sha256).digest()
            record.update(observation_type='wifi-candidate',candidate_id=str(uuid.UUID(bytes=digest[:16])),
                signature=entry['signature'],frequency_mhz=entry['frequency_mhz'],location_grid_degrees=.01,latitude=lat,longitude=lon)
        else:
            for field in ('rid','id_type','aircraft_type','protocol','latitude','longitude','altitude_m','speed_mps','heading'):
                if field in entry:
                    record[field]=entry[field]
        if 'rssi_dbm' in entry:
            record['rssi_dbm']=entry['rssi_dbm']
        self.store.add(record,settings['share_areas' if candidate else 'share_rid'])
        self.last_queued[key]=(received,stamp)

    def snapshot(self):
        with self.lock:
            settings=self.store.settings()
            now=time.time()
            contacts=[]
            for entry in self.contacts.values():
                if now-entry['seen']>120:
                    continue
                row={k:v for k,v in entry.items() if k!='id_seen'}
                if 'observed_at' in row and now-row['observed_at']>120:
                    for field in ('latitude','longitude','observed_at','altitude_m','speed_mps','heading'):
                        row.pop(field,None)
                if settings['station'] is not None and 'latitude' in row:
                    row['bearing'],row['distance_m']=bearing_distance(settings['station'],[row['latitude'],row['longitude']])
                contacts.append(row)
            spectrum=sorted((v for v in self.spectrum.values() if now-v['seen']<20),key=lambda v:v['frequency_mhz'])
            if spectrum:
                baseline=statistics.median(v['power_db'] for v in spectrum)
                spectrum=[{**v,'above_median_db':round(v['power_db']-baseline,2)} for v in spectrum]
            return {'version':__version__,'running':self.running,'settings':settings,'contacts':contacts,
                'spectrum':spectrum,'radios':dict(self.states),'wifi_frames':self.frame_count,'rid_messages':self.message_count,'decoded_messages':self.decoded_count,
                'counts':self.store.counts(),'upload_status':self.uploader.status if self.running else 'Scanner stopped',
                'connected':self.store.connected(),'display_name':self.store.config.get('display_name',''),
                'pair':self.connection.public_pair(),'account_status':self.account_status}

    def close(self):
        self.quit_event.set()
        self.stop()
        self.background.join(timeout=15)
