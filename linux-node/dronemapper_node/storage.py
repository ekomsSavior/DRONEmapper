"""Private node settings and bounded durable upload queue. AGPL-3.0-or-later."""
import copy
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import uuid
from .protocol import finite
from .serial_receiver import valid_port, BAUDS, FORMATS
from .platform_support import private_directory, lock_file, valid_interface, valid_ble, is_link

ORIGIN = 'https://dronemapper.churchofmalware.org'
DEFAULTS = {'label': 'Stationary node', 'wifi_interfaces': [], 'ble_adapter': '',
            'sdr': 'off', 'sdr_band': '2400', 'sdr_mode':'spectrum', 'dji_frequency':2444.5, 'readsb_file':'', 'station': None,
            'share_rid': False, 'share_areas': False, 'share_robots':False, 'share_decoded':False, 'mqtt_file': '', 'serial_port':'', 'serial_baud':115200, 'serial_format':'marauder'}
BANDS = {'433': (430,440), '868': (863,870), '915': (902,928), '2400': (2400,2485),
         '5800': (5725,5875), '5900': (5850,5925), '1090': (1089,1091), 'ais': (161,163)}


def validate_settings(values):
    if not isinstance(values,dict) or set(values) - set(DEFAULTS):
        raise ValueError('Unknown settings')
    v = copy.deepcopy(DEFAULTS)
    v.update(values)
    if not isinstance(v['label'],str) or not 1 <= len(v['label']) <= 80 or any(ord(x)<32 for x in v['label']):
        raise ValueError('Use a node name of 1–80 printable characters')
    interfaces = v['wifi_interfaces']
    if not isinstance(interfaces,list) or len(interfaces)>4 or any(not valid_interface(x) for x in interfaces) or len(set(interfaces))!=len(interfaces):
        raise ValueError('Choose up to four distinct monitor interfaces')
    if not valid_ble(v['ble_adapter']):
        raise ValueError('Choose the system Bluetooth adapter or a Linux hci controller')
    if v['sdr'] not in ('off','hackrf','rtl') or not isinstance(v['sdr_band'],str) or v['sdr_band'] not in BANDS:
        raise ValueError('Choose a supported SDR and band')
    if not isinstance(v['sdr_mode'],str) or v['sdr_mode'] not in ('spectrum','adsb','dji'):
        raise ValueError('Choose spectrum, ADS-B or DJI decoding')
    if not finite(v['dji_frequency'],2390,5875) or v['dji_frequency'] not in (2399.5,2414.5,2429.5,2444.5,2459.5,5756.5,5776.5,5796.5):
        raise ValueError('Choose a supported DJI research channel')
    if v['sdr_mode']=='dji' and v['sdr'] not in ('off','hackrf'):
        raise ValueError('DJI capture needs HackRF; RTL-SDR cannot receive this waveform')
    if not isinstance(v['readsb_file'],str) or len(v['readsb_file'])>4096 or '\0' in v['readsb_file']:
        raise ValueError('Invalid readsb JSON path')
    if v['sdr_mode']=='adsb' and v['readsb_file'] and v['sdr']!='off':
        raise ValueError('Choose either a managed ADS-B receiver or an existing readsb file')
    if v['sdr']=='rtl' and v['sdr_mode']=='spectrum' and BANDS[v['sdr_band']][1]>1766:
        raise ValueError('RTL-SDR cannot directly tune 2.4 / 5 GHz; choose a lower band or HackRF')
    if any(type(v[k]) is not bool for k in ('share_rid','share_areas','share_robots','share_decoded')):
        raise ValueError('Sharing choices must be true or false')
    if v['station'] is not None and (not isinstance(v['station'],list) or len(v['station'])!=2 or not finite(v['station'][0],-89.99,89.99) or not finite(v['station'][1],-179.99,179.99)):
        raise ValueError('Station location needs valid latitude and longitude')
    if (v['share_areas'] or v['share_robots']) and v['station'] is None:
        raise ValueError('Set a stationary receiver location before sharing approximate areas')
    if not isinstance(v['mqtt_file'],str) or len(v['mqtt_file'])>4096 or '\0' in v['mqtt_file']:
        raise ValueError('Invalid MQTT configuration path')
    if not valid_port(v['serial_port']) or type(v['serial_baud']) is not int or v['serial_baud'] not in BAUDS or v['serial_format'] not in FORMATS:
        raise ValueError('Choose a local USB serial port, supported baud rate and receiver format')
    return v


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).expanduser()
        private_directory(self.directory)
        self.lock = threading.RLock()
        self.lockfile = lock_file(self.directory/'node.lock')
        self.path = self.directory/'settings.json'
        self.config = {'node_id':str(uuid.uuid4()),'secret':secrets.token_hex(32),'settings':copy.deepcopy(DEFAULTS)}
        if self.path.exists():
            if is_link(self.path):
                raise ValueError('Settings must not be a symlink')
            self.config = json.loads(self.path.read_text(encoding='utf-8'))
            self.config['settings'] = validate_settings(self.config['settings'])
            uuid.UUID(self.config['node_id'])
            if not re.fullmatch('[a-f0-9]{64}',self.config.get('secret','')):
                raise ValueError('Invalid private node configuration')
        self.save()
        dbpath = self.directory/'observations.sqlite3'
        if dbpath.exists() and is_link(dbpath):
            raise ValueError('Observation database must not be a symlink')
        self.db = sqlite3.connect(dbpath,check_same_thread=False)
        os.chmod(dbpath,0o600)
        self.db.execute('CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, created REAL NOT NULL, data TEXT NOT NULL, state TEXT NOT NULL)')
        self.db.commit()

    def save(self):
        with self.lock:
            tmp = self.directory/('settings-'+secrets.token_hex(8)+'.tmp')
            fd = os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as stream:
                json.dump(self.config,stream,allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp,self.path)

    def settings(self):
        with self.lock:
            return copy.deepcopy(self.config['settings'])

    def update(self, values):
        checked = validate_settings(values)
        with self.lock:
            self.config['settings'] = checked
            # Disabling sharing cancels pending uploads immediately, not after restart.
            for row in self.db.execute("SELECT id,data FROM events WHERE state='queued'").fetchall():
                kind = json.loads(row[1]).get('observation_type')
                choice='share_robots' if kind=='ble-robot-candidate' else 'share_areas' if kind=='wifi-candidate' else 'share_decoded' if kind in ('adsb-uas','dji-droneid') else 'share_rid'
                if not checked[choice]:
                    self.db.execute("UPDATE events SET state='local' WHERE id=?",(row[0],))
            self.db.commit()
            self.save()

    def connected(self):
        return bool(self.config.get('token'))

    def add(self, record, share):
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO events VALUES(?,?,?,?)',
                (record['event_id'],record['received_at'],json.dumps(record,allow_nan=False),'queued' if share and self.connected() else 'local'))
            self.db.execute('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created DESC LIMIT -1 OFFSET 10000)')
            self.db.commit()

    def batch(self, now=None):
        now = time.time() if now is None else now
        with self.lock:
            self.db.execute("UPDATE events SET state='expired' WHERE state='queued' AND created<?",(now-750,))
            self.db.commit()
            return [json.loads(r[0]) for r in self.db.execute("SELECT data FROM events WHERE state='queued' ORDER BY created LIMIT 50")]

    def mark(self, records, state):
        with self.lock:
            self.db.executemany('UPDATE events SET state=? WHERE id=?',[(state,r['event_id']) for r in records])
            self.db.commit()

    def counts(self):
        with self.lock:
            return dict(self.db.execute('SELECT state,COUNT(*) FROM events GROUP BY state').fetchall())

    def disconnect(self):
        with self.lock:
            for k in ('token','node_handle','display_name','pair'):
                self.config.pop(k,None)
            settings=self.settings()
            settings.update(share_rid=False,share_areas=False,share_robots=False,share_decoded=False)
            self.update(settings)

    def close(self):
        self.db.close()
        self.lockfile.close()
