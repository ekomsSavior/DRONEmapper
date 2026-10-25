"""Offline wire fixtures only: these tests never contact the public map or transmit RF."""
import base64
import ctypes
import ctypes.util
import hashlib
import http.client
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node.protocol import messages, wifi_frame, radiotap, PcapStream, spectrum_row, bearing_distance, camera_signature
from dronemapper_node.radios import mqtt_envelope, WIFI_FILTER, process_bytes
from dronemapper_node.storage import Store, validate_settings, ORIGIN
from dronemapper_node.engine import Engine
from dronemapper_node.account import Connection, Uploader, ApiError
from dronemapper_node.dashboard import make_server

NOW=1800000100.0
MAC='00:11:22:33:44:55'


def basic(serial=b'UNIT-TEST-ONLY',id_type=1):
    return bytes([2,(id_type<<4)|2])+serial.ljust(20,b'\0')+bytes(3)


def location(stamp=NOW,lat=37.1234567,lon=-122.1234567):
    b=bytearray(25);b[0]=0x12;b[2]=90;b[3]=20
    struct.pack_into('<ii',b,5,round(lat*1e7),round(lon*1e7))
    struct.pack_into('<H',b,15,2200)
    struct.pack_into('<H',b,21,round((stamp%3600)*10))
    return bytes(b)


def pack(*parts):
    return bytes([0xf2,25,len(parts)])+b''.join(parts)


def event(payload=None,**extra):
    return {'type':'rid','mac':MAC,'source':'unit-test','protocol':'ble','received_at':NOW,
            'payload':payload if payload is not None else pack(basic(),location()),'rssi_dbm':-54,**extra}


def beacon(ies):
    frame=bytearray(36);frame[0]=0x80;frame[10:16]=bytes.fromhex(MAC.replace(':',''))
    return bytes(frame)+ies


def ie(kind,value):
    return bytes([kind,len(value)])+value


class ProtocolTests(unittest.TestCase):
    @unittest.skipUnless(ctypes.util.find_library('pcap'),'libpcap not installed')
    def test_capture_filter_compiles_and_admits_beacons_probe_responses_actions(self):
        lib=ctypes.CDLL(ctypes.util.find_library('pcap'))
        class Program(ctypes.Structure):
            _fields_=[('length',ctypes.c_uint),('insns',ctypes.c_void_p)]
        class Header(ctypes.Structure):
            _fields_=[('seconds',ctypes.c_long),('micros',ctypes.c_long),('captured',ctypes.c_uint),('original',ctypes.c_uint)]
        lib.pcap_open_dead.argtypes=[ctypes.c_int,ctypes.c_int];lib.pcap_open_dead.restype=ctypes.c_void_p
        lib.pcap_compile.argtypes=[ctypes.c_void_p,ctypes.POINTER(Program),ctypes.c_char_p,ctypes.c_int,ctypes.c_uint]
        lib.pcap_offline_filter.argtypes=[ctypes.POINTER(Program),ctypes.POINTER(Header),ctypes.c_void_p]
        lib.pcap_freecode.argtypes=[ctypes.POINTER(Program)];lib.pcap_close.argtypes=[ctypes.c_void_p]
        for linktype in (105,127):
            capture=lib.pcap_open_dead(linktype,4096);program=Program()
            try:
                self.assertEqual(lib.pcap_compile(capture,ctypes.byref(program),WIFI_FILTER.encode(),1,0xffffffff),0)
                for control,expected in ((0x80,True),(0x50,True),(0xd0,True),(0x08,False),(0x40,False)):
                    frame=bytes([control])+bytes(35)
                    if linktype==127:frame=struct.pack('<BBHI',0,0,8,0)+frame
                    header=Header(0,0,len(frame),len(frame));buffer=ctypes.create_string_buffer(frame)
                    self.assertEqual(bool(lib.pcap_offline_filter(ctypes.byref(program),ctypes.byref(header),buffer)),expected)
            finally:
                lib.pcap_freecode(ctypes.byref(program));lib.pcap_close(capture)

    def test_receiver_diagnostic_keeps_failure_not_help_footer(self):
        command=[sys.executable,'-c','import sys;sys.stderr.write("device not found\\nUsage:\\ntrailing help\\n");sys.exit(1)']
        with self.assertRaisesRegex(RuntimeError,'device not found'):
            list(process_bytes(command,threading.Event()))

    def test_basic_location_units_and_fields(self):
        identity,loc=messages(pack(basic(),location()),NOW)
        self.assertEqual(identity['aircraft_type'],2)
        self.assertEqual(loc,{'type':'location','latitude':37.1234567,'longitude':-122.1234567,
                              'observed_at':NOW,'altitude_m':100,'speed_mps':5,'heading':90})

    def test_hour_rollover_and_stale_locations(self):
        self.assertAlmostEqual(messages(location(3599.9),3600.1)[0]['observed_at'],3599.9)
        self.assertEqual(messages(location(NOW-121),NOW),[])
        self.assertEqual(messages(location(NOW+6),NOW),[])
        self.assertEqual(messages(location(lat=0,lon=0),NOW),[])

    def test_strict_message_bounds_and_version(self):
        valid=pack(basic(),location())
        for invalid in (valid[:-1],valid+b'\0',b'\xf2\x19\x0a'+basic()*10,b'\xf2\x18\x01'+basic(),b'\x01'+basic()[1:],bytes(25)):
            self.assertEqual(messages(invalid,NOW),[])
        # Operator/system packets are not retained.
        self.assertEqual(messages(bytes([0x42])+bytes(24),NOW),[])

    def test_unknown_motion_fields_are_absent(self):
        b=bytearray(location());b[1]=1;b[2]=255;b[3]=255;b[15:17]=bytes(2)
        self.assertEqual(set(messages(b,NOW)[0]),{'type','latitude','longitude','observed_at'})

    def test_beacon_and_camera_link(self):
        wire=beacon(ie(0,b'WIFI_8K__abcdef')+ie(221,b'\xfa\x0b\xbc\x0d\0'+basic()))
        decoded=wifi_frame(wire)
        self.assertEqual(decoded[0]['payload'],basic())
        self.assertEqual(decoded[1]['signature'],'wifi-cam-name')
        self.assertEqual(wifi_frame(wire+b'\x01\x05'),[])
        protected=bytearray(wire);protected[1]=0x40
        self.assertEqual(wifi_frame(protected),[])
        self.assertIsNone(camera_signature('My Home WiFi'))

    def test_nan_service_payload_and_strict_length(self):
        frame=bytearray(30);frame[0]=0xd0;frame[4:10]=bytes.fromhex('516f9a010000')
        frame[10:16]=bytes.fromhex(MAC.replace(':',''));frame[24:30]=bytes.fromhex('0409506f9a13')
        value=bytes.fromhex('8869199d9209')+bytes([1,0,0x10,26,0])+basic()
        wire=bytes(frame)+bytes([3])+struct.pack('<H',len(value))+value
        self.assertEqual(wifi_frame(wire)[0]['payload'],basic())
        self.assertEqual(wifi_frame(wire[:-1]),[])

    def test_radiotap_metadata_and_bad_fcs(self):
        head=struct.pack('<BBHI',0,0,15,(1<<1)|(1<<3)|(1<<5))+bytes([0x10,0])+struct.pack('<HHb',2437,0,-48)
        result=radiotap(head+b'frame'+bytes(4))
        self.assertEqual(result,(b'frame',{'frequency_mhz':2437,'rssi_dbm':-48}))
        bad=bytearray(head);bad[8]=0x40
        self.assertIsNone(radiotap(bad+b'frame'))
        self.assertIsNone(radiotap(head[:12]))

    def test_pcap_partial_stream_and_invalid_link(self):
        header=struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,4096,127)
        packet=struct.pack('<IIII',100,500000,3,3)+b'abc'
        reader=PcapStream();output=[]
        for byte in header+packet: output.extend(reader.feed(bytes([byte])))
        self.assertEqual(output,[(100.5,b'abc',127)])
        with self.assertRaises(ValueError): PcapStream().feed(header[:-4]+struct.pack('<I',1))
        with self.assertRaises(ValueError): reader.feed(struct.pack('<IIII',100,0,70000,70000))

    def test_mqtt_rejects_retained_stale_operator_fields(self):
        r={'schema_version':1,'mac':MAC,'protocol':'ble','received_at':NOW,'payload_hex':basic().hex()}
        self.assertEqual(mqtt_envelope(json.dumps(r),NOW)['payload'],basic())
        self.assertIsNone(mqtt_envelope(json.dumps(r),NOW,retained=True))
        for changes in ({'schema_version':True},{'received_at':NOW-121},{'pilot_latitude':20},{'mac':'FF:FF:FF:FF:FF:FF'},{'payload_hex':'z'*50},{'protocol':'arbitrary'},{'received_at':float('nan')}):
            self.assertIsNone(mqtt_envelope(json.dumps({**r,**changes}),NOW))

    def test_spectrum_bins_and_invalid_values(self):
        bins=spectrum_row('2026-10-17, 12:00:00, 2400000000, 2405000000, 1000000, 20, -64, -63, -61, -62, -60')
        self.assertEqual(len(bins),5);self.assertEqual(bins[0]['frequency_mhz'],2400.5)
        self.assertEqual(spectrum_row('x,x,nan,1,1,1,1'),[])
        self.assertEqual(spectrum_row('x,x,1,2,0,1,1'),[])
        self.assertEqual(spectrum_row('x,x,1,2,1,1,nan'),[])

    def test_true_bearing(self):
        self.assertAlmostEqual(bearing_distance([0,0],[1,0])[0],0)
        self.assertAlmostEqual(bearing_distance([0,0],[0,1])[0],90)
        self.assertAlmostEqual(bearing_distance([0,0],[0,1])[1],111195,delta=1)


class NodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(self.tmp.name);self.engines=[]

    def tearDown(self):
        for engine in self.engines: engine.close()
        self.store.close();self.tmp.cleanup()

    def engine(self):
        engine=Engine(self.store);self.engines.append(engine);return engine

    def test_receivers_run_together_and_ble_failure_does_not_stop_others(self):
        self.store.update({**self.store.settings(),'wifi_interfaces':['dmmon0'],'ble_adapter':'hci1','sdr':'hackrf'})
        started={name:threading.Event() for name in ('wifi','ble','sdr')}
        def wifi(interface,stop,emit,status):
            emit({'type':'frame'});status('Listening');started['wifi'].set();stop.wait()
        def ble(adapter,stop,emit,status):
            started['ble'].set();raise RuntimeError('Passive API unavailable')
        def sdr(kind,band,stop,emit,status):
            emit({'type':'spectrum','bins':[{'frequency_mhz':2401,'power_db':-70}]})
            status('Listening');started['sdr'].set();stop.wait()
        with patch('dronemapper_node.engine.radios.wifi',wifi), patch('dronemapper_node.engine.radios.ble',ble), patch('dronemapper_node.engine.radios.sdr',sdr):
            engine=self.engine();engine.start()
            self.assertTrue(all(signal.wait(2) for signal in started.values()))
            snapshot=engine.snapshot()
            self.assertEqual(snapshot['wifi_frames'],1)
            self.assertEqual(len(snapshot['spectrum']),1)
            self.assertTrue(engine.running)
            self.assertTrue(all(thread.is_alive() for thread in engine.threads))
            engine.stop()
            self.assertTrue(all(not thread.is_alive() for thread in engine.threads))

    def connected(self):
        self.store.config['token']='x'*43
        self.store.update({**self.store.settings(),'share_rid':True})

    def test_settings_bad_types_and_rtl_band(self):
        for values in ({'wifi_interfaces':[{}]},{'sdr_band':{}},{'station':[True,4]},{'share_rid':1},{'sdr':'rtl'},{'share_areas':True},{'wifi_interfaces':['-i']}):
            with self.assertRaises(ValueError): validate_settings(values)

    def test_private_state_and_single_instance(self):
        if os.name!='nt':
            self.assertEqual(self.store.path.stat().st_mode&0o777,0o600)
            self.assertEqual(Path(self.tmp.name).stat().st_mode&0o777,0o700)
        with self.assertRaises(ValueError): Store(self.tmp.name)

    @patch('time.time',return_value=NOW)
    def test_identity_association_and_source_isolation(self,_):
        e=self.engine();e.ingest(event(basic()));e.ingest(event(location()))
        self.assertEqual(len(e.snapshot()['contacts']),1)
        self.assertEqual(self.store.counts(),{'local':1})
        e.ingest(event(basic(b'ANOTHER-TEST-ID'),received_at=NOW+1))
        self.assertNotIn('latitude',e.snapshot()['contacts'][0])
        e.ingest(event(location(),source='other-radio'))
        self.assertEqual(len(e.snapshot()['contacts']),1)

    @patch('time.time',return_value=NOW)
    def test_dedupe_privacy_and_consent_cancel(self,_):
        self.connected();e=self.engine();e.ingest(event());e.ingest(event())
        records=self.store.batch(NOW);self.assertEqual(len(records),1)
        self.assertNotIn('mac',records[0]);self.assertNotIn('token',e.snapshot())
        self.store.update({**self.store.settings(),'share_rid':False})
        self.assertEqual(self.store.batch(NOW),[])
        self.store.update({**self.store.settings(),'share_rid':True})
        self.assertEqual(self.store.batch(NOW),[])  # no retroactive upload

    @patch('time.time',return_value=NOW)
    def test_area_rounding_local_mac_and_spectrum_never_queued(self,_):
        self.connected();self.store.update({**self.store.settings(),'station':[37.123456,-122.123456],'share_areas':True})
        e=self.engine();e.ingest(event(type='candidate',name='WIFI_8K__abcdef',signature='wifi-cam-name',frequency_mhz=2437))
        record=self.store.batch(NOW)[0]
        self.assertEqual((record['latitude'],record['longitude']),(37.125,-122.125))
        self.assertNotIn('mac',record);self.assertNotIn('ssid',record)
        self.assertEqual(e.snapshot()['contacts'][0]['mac'],MAC)
        e.ingest({'type':'spectrum','bins':[{'frequency_mhz':915,'power_db':-20}]})
        self.assertEqual(len(self.store.batch(NOW)),1)
        self.assertEqual(len(e.snapshot()['spectrum']),1)

    @patch('time.time',return_value=NOW)
    def test_queue_restart_expiry_and_partial_ack_retry(self,_):
        self.connected();e=self.engine();e.ingest(event());first=self.store.batch(NOW)
        class Partial:
            def post(self,*args):return {'accepted':0,'duplicates':0}
        u=Uploader(self.store,Partial());u.tick()
        self.assertEqual(self.store.batch(NOW),first)
        class Duplicate:
            def post(self,*args):return {'accepted':0,'duplicates':1}
        u=Uploader(self.store,Duplicate());u.tick()
        self.assertEqual(self.store.counts(),{'sent':1})
        late={**first[0],'event_id':str(uuid.uuid4()),'received_at':NOW-751}
        self.store.add(late,True);self.assertEqual(self.store.batch(NOW),[])
        e.close();self.engines.remove(e);self.store.close();self.store=Store(self.tmp.name)
        self.assertEqual(self.store.counts(),{'sent':1,'expired':1})

    @patch('time.time',return_value=NOW)
    def test_revoked_credential_stops_sharing(self,_):
        self.connected();self.engine().ingest(event())
        class Rejected:
            def post(self,*args):raise ApiError(401)
        Uploader(self.store,Rejected()).tick()
        self.assertFalse(self.store.settings()['share_rid']);self.assertEqual(self.store.batch(NOW),[])

    def test_pair_proof_key_and_secret_not_displayed(self):
        class PairApi:
            def post(api,path,body,token=None):
                if path.endswith('/start'):
                    api.challenge=body['challenge']
                    return {'device_id':str(uuid.uuid4()),'user_code':'ABCDE-12345','expires_at':(time.time()+600)*1000,'verification_url':ORIGIN+'/account.html?device=ABCDE-12345'}
                self.assertEqual(base64.urlsafe_b64encode(hashlib.sha256(body['verifier'].encode()).digest()).decode().rstrip('='),api.challenge)
                return {'status':'connected','node_key':'x'*43,'node_handle':str(uuid.uuid4()),'display_name':'Tester'}
        c=Connection(self.store,PairApi());public=c.start();self.assertNotIn('verifier',public)
        c.poll();self.assertTrue(self.store.connected());self.assertFalse(self.store.settings()['share_rid'])

    def test_disconnect_during_poll_cannot_reconnect(self):
        class Delayed:
            def post(api,*args):
                self.store.disconnect()
                return {'status':'connected','node_key':'x'*43,'node_handle':str(uuid.uuid4())}
        self.store.config['pair']={'device_id':str(uuid.uuid4()),'verifier':'private','expires_at':(time.time()+600)*1000,'user_code':'ABCDE-12345','verification_url':ORIGIN+'/account.html?device=ABCDE-12345'}
        Connection(self.store,Delayed()).poll();self.assertFalse(self.store.connected())

    def test_dashboard_host_csrf_and_partial_settings(self):
        e=self.engine();server=make_server(e,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        port=server.server_port
        def request(path='/',method='GET',body=None,headers=None):
            c=http.client.HTTPConnection('127.0.0.1',port,timeout=3)
            c.request(method,path,body=body,headers=headers or {});r=c.getresponse();data=r.read();status=r.status;c.close();return status,data
        try:
            status,data=request('/api/status');self.assertEqual(status,200);csrf=json.loads(data)['csrf']
            self.assertEqual(request('/api/status',headers={'Host':'evil.example'})[0],403)
            self.assertEqual(request('/api/status',headers={'Sec-Fetch-Site':'cross-site'})[0],403)
            self.assertEqual(request('/api/settings','POST','{}',{'Content-Type':'application/json'})[0],403)
            headers={'Content-Type':'application/json','Origin':f'http://127.0.0.1:{port}','X-Node-CSRF':csrf}
            self.assertEqual(request('/api/settings','POST','{"label":"Test node"}',headers)[0],200)
            self.assertEqual(e.snapshot()['settings']['label'],'Test node')
            self.assertEqual(request('/api/settings','POST','{"wifi_interfaces":[{}]}',headers)[0],400)
            self.assertEqual(request('/api/serial','POST','{"serial_port":""}',{'Content-Type':'application/json'})[0],403)
            self.assertEqual(request('/api/serial','POST','{"serial_port":"socket://x"}',headers)[0],400)
            self.assertEqual(request('/api/serial','POST','{"serial_port":""}',headers)[0],200)
            self.assertEqual(request('/../../settings.json')[0],404)
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
