"""Offline fixtures, no RF transmission or external uploads."""
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node.decoders import adsb_records,dji_payload,read_json,live_dji_records
from dronemapper_node.engine import Engine
from dronemapper_node.storage import Store,validate_settings
from dronemapper_node.capture import capture_iq
NOW=1800000100.0


def document(**changes):
    return {'now':NOW,'aircraft':[{'hex':'abc123','type':'adsb_icao','seen':.5,'seen_pos':1,
        'lat':37.1,'lon':-122.1,'alt_geom':1000,'gs':20,'track':90,'rssi':-21.5,'category':'B6',**changes}]}


def packet(**changes):
    # Intentionally invalid/private operator coordinates must never be emitted.
    values=dict(lon=round(-122.1*174533),lat=round(37.1*174533),serial=b'TEST-ONLY',stamp=int(NOW*1000),model=58)
    values.update(changes)
    raw=struct.pack('<BBBHH16siihhhhhhQiiiiBB20s',88,16,2,1,0,values['serial'],values['lon'],values['lat'],
        300,50,0,0,0,0,values['stamp'],12345678,87654321,12345678,87654321,values['model'],0,bytes(20))
    crc=0x3692
    for byte in raw:
        crc^=byte
        for _ in range(8):crc=(crc>>1)^(0x8408 if crc&1 else 0)
    return raw+struct.pack('<H',crc)


class DecoderTests(unittest.TestCase):
    def test_adsb_fresh_direct_coordinates_units_and_uas_claim(self):
        r=adsb_records(document(),NOW)[0]
        self.assertTrue(r['unmanned']);self.assertEqual(r['device_id'],'ABC123')
        self.assertEqual(r['observed_at'],NOW-1);self.assertEqual(r['altitude_m'],304.8)
        self.assertEqual(r['rssi_dbfs'],-21.5);self.assertNotIn('rssi_dbm',r)
        self.assertAlmostEqual(r['speed_mps'],10.289,places=3)
        self.assertFalse(adsb_records(document(category='A3',dbFlags=1,flight='DRONE'),NOW)[0]['unmanned'])

    def test_database_family_enrichment_does_not_promote_aircraft(self):
        for code, family in [('Q1','Predator / Gray Eagle family'),('Q9','MQ-9 family')]:
            row=adsb_records(document(t=code,category='A3'),NOW)[0]
            self.assertFalse(row['unmanned']);self.assertEqual(row['model'],family)
            self.assertIn('database family',row['model_basis'])
        for code in ['Q9B','MQ-9B',None,{},'']:
            self.assertNotIn('model',adsb_records(document(t=code),NOW)[0])

    def test_stale_guessed_indirect_nonicao_and_malformed_ignored(self):
        for changes in ({'type':'mlat'},{'hex':'~abc123'},{'hex':'000000'},{'seen_pos':61},
                        {'seen':float('nan')},{'lat':0,'lon':0},{'lat':True},{'lat':None},
                        {'mlat':['lat']},{'tisb':['lon']},{'mlat':None},{'type':'adsr_icao'}):
            self.assertEqual(adsb_records(document(**changes),NOW),[],changes)
        doc=document();doc['now']=NOW-16
        self.assertEqual(adsb_records(doc,NOW),[])
        doc=document();del doc['aircraft'][0]['lat'];doc['aircraft'][0]['rr_lat']=37
        self.assertEqual(adsb_records(doc,NOW),[])

    def test_record_files_bounded_regular_and_no_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'input';p.write_text('{}')
            self.assertEqual(read_json(p),{})
            with self.assertRaises(ValueError):read_json(p,1)
            link=Path(tmp)/'link'
            try:
                link.symlink_to(p)
            except OSError:
                if os.name!='nt': raise
            else:
                with self.assertRaises(OSError):read_json(link)
            if hasattr(os,'mkfifo'):
                fifo=Path(tmp)/'fifo';os.mkfifo(fifo)
                with self.assertRaises(ValueError):read_json(fifo)

    def test_dji_crc_only_aircraft_fields_and_unknown_identity(self):
        r=dji_payload(packet());self.assertEqual(r['model'],'Mavic Air 2')
        self.assertEqual(r['device_id'],'TEST-ONLY');self.assertEqual(r['observed_at'],NOW)
        self.assertAlmostEqual(r['latitude'],37.1,places=4)
        self.assertEqual(set(r),{'protocol','device_id','manufacturer','model','model_code','verification','unmanned','identification','name','observed_at','latitude','longitude'})
        self.assertIsNone(dji_payload(packet()[:-1]));bad=bytearray(packet());bad[30]^=1
        self.assertIsNone(dji_payload(bytes(bad)))
        r=dji_payload(packet(lat=0,lon=0,serial=bytes(16),model=255))
        self.assertNotIn('latitude',r);self.assertIsNone(r['device_id']);self.assertIsNone(r['model'])

    def test_live_dji_requires_current_capture_original_time_crc_id_and_gps(self):
        row=dji_payload(packet())
        report={'detections':[row]}
        events=live_dji_records(report,NOW,NOW+5,2444.5)
        self.assertEqual(len(events),1);self.assertEqual(events[0]['observed_at'],NOW)
        self.assertEqual(events[0]['received_at'],NOW)
        for changes in ({'observed_at':NOW-30},{'device_id':None},{'latitude':None},{'verification':'failed'}):
            self.assertEqual(live_dji_records({'detections':[{**row,**changes}]},NOW,NOW+5,2444.5),[])
        self.assertEqual(live_dji_records(report,NOW-61,NOW,2444.5),[])

    @patch('time.time',return_value=NOW)
    def test_live_dji_queue_no_operator_data_no_remoteid_fabrication(self,_):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(tmp);store.config['token']='x'*43;engine=Engine(store)
            try:
                store.update({**store.settings(),'share_decoded':True})
                event=live_dji_records({'detections':[dji_payload(packet())]},NOW,NOW,2444.5)[0]
                engine.ingest(event);engine.ingest(event)
                batch=store.batch(NOW);self.assertEqual(len(batch),1)
                self.assertEqual(batch[0]['observation_type'],'dji-droneid')
                self.assertNotIn('rid',batch[0]);self.assertNotIn('manufacturer',batch[0])
                self.assertNotIn('app_lat',json.dumps(batch))
                store.update({**store.settings(),'share_decoded':False})
                self.assertEqual(store.batch(NOW),[])
            finally:engine.close();store.close()

    def test_spectrum_and_adsb_device_settings(self):
        self.assertEqual(validate_settings({'sdr':'rtl','sdr_mode':'adsb'})['sdr_mode'],'adsb')
        for changes in ({'sdr_mode':'command'},{'readsb_file':[]},{'sdr':'rtl','sdr_mode':'adsb','readsb_file':'/tmp/a'},{'share_decoded':1},{'sdr':'rtl','sdr_mode':'dji'},{'dji_frequency':1090}):
            with self.assertRaises(ValueError):validate_settings(changes)
        self.assertFalse(validate_settings({})['share_decoded'])

    @patch('time.time',return_value=NOW)
    def test_adsb_queue_separate_consent_no_airliner_or_replay_upload(self,_):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(tmp);store.config['token']='x'*43
            engine=Engine(store)
            try:
                store.update({**store.settings(),'share_rid':True,'share_decoded':True,'station':[37,-122]})
                aircraft=adsb_records(document(category='A3'),NOW)[0];engine.ingest(aircraft)
                self.assertEqual(store.counts(),{})
                drone=adsb_records(document(),NOW)[0];engine.ingest(drone);engine.ingest(drone)
                batch=store.batch(NOW);self.assertEqual(len(batch),1)
                self.assertEqual(batch[0]['observation_type'],'adsb-uas')
                self.assertNotIn('rid',batch[0]);self.assertNotIn('rssi_dbm',batch[0])
                self.assertIn('bearing',engine.snapshot()['contacts'][0])
                engine.ingest({**drone,'received_at':NOW-121})
                self.assertEqual(len(store.batch(NOW)),1)
                store.update({**store.settings(),'share_decoded':False})
                self.assertEqual(store.batch(NOW),[])
                store.update({**store.settings(),'share_decoded':True})
                self.assertEqual(store.batch(NOW),[])
            finally:engine.close();store.close()

    def test_capture_is_receive_only_and_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'iq'
            def run(command,**kwargs):
                self.assertIn('-r',command);self.assertNotIn('-t',command)
                self.assertEqual(command[command.index('-n')+1],'2000000')
                os.write(kwargs['pass_fds'][0],bytes(4000000))
                return type('Result',(),{'returncode':0})()
            with patch('shutil.which',return_value='/bin/hackrf_transfer'),patch('subprocess.run',side_effect=run),patch('dronemapper_node.capture.system',return_value='Linux'):
                result=capture_iq(target,2444.5,.1)
                self.assertEqual(result['sample_format'],'cs8');self.assertEqual(result['sample_rate'],20000000)
                if os.name!='nt': self.assertEqual(target.stat().st_mode&0o777,0o600)
                with self.assertRaises(FileExistsError):capture_iq(target,2444.5,.1)
                with self.assertRaises(ValueError):capture_iq(target,1090,.1)
