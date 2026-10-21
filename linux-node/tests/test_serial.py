"""Offline serial wire tests. Never transmit RF or upload fixture data."""
import importlib.util
import json
import os
from pathlib import Path
import random
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node.serial_receiver import Lines, marauder, decode_line, valid_port, receive
from dronemapper_node.storage import Store, validate_settings
from dronemapper_node.engine import Engine
from test_node import NOW, MAC, basic, location, pack


def rid_line(**changes):
    fields = ['2000','UNIT-TEST-ONLY','OPERATOR-PRIVATE','3','6','-45','7','2.0',
              'active','0','0','0','0','37.0','-122.0','100','1','20','1','5','1',
              '90','1','38.1234','-123.5678','0','0','0','0','0']
    for key,value in changes.items():
        fields[int(key)] = str(value)
    return ('RID,'+','.join(fields)).encode()


class SerialTests(unittest.TestCase):
    def test_csv_retains_receiver_facts_without_inventing_fresh_position(self):
        row = marauder(rid_line(), NOW)
        self.assertEqual(row['channel'],6)
        self.assertEqual(row['packet_count'],7)
        self.assertEqual(row['transports'],'Wi-Fi beacon, Wi-Fi NAN')
        self.assertEqual(row['reported_latitude'],37)
        self.assertTrue(row['local_only'])
        for field in ('latitude','longitude','observed_at','id_type','rid','operator_id','operator_latitude'):
            self.assertNotIn(field,row)
        self.assertNotIn('OPERATOR-PRIVATE',json.dumps(row))
        self.assertNotIn('38.1234',json.dumps(row))

    def test_csv_rejects_malformed_lost_and_invalid_values(self):
        for value in (b'',b'hello',rid_line()+b',extra',rid_line().rsplit(b',',1)[0],
                      rid_line(**{'8':'lost'}),rid_line(**{'3':0}),rid_line(**{'3':16}),
                      rid_line(**{'5':-200}),rid_line(**{'13':'nan'}),rid_line(**{'13':91}),
                      rid_line(**{'16':2}),rid_line(**{'6':-1}),rid_line(**{'1':'x'*21}),
                      rid_line(**{'0':2**32}),rid_line(**{'4':999})):
            self.assertIsNone(marauder(value,NOW),value)

    def test_line_bounds_fragmented_input_and_recovery(self):
        stream=Lines(); wire=rid_line()+b'\r\n'+b'x'*4097+rid_line()+b'\n'+rid_line()+b'\n'
        result=[]
        for offset in range(0,len(wire),17): result.extend(stream.feed(wire[offset:offset+17]))
        self.assertEqual(result,[rid_line(),rid_line()])
        self.assertEqual(stream.rejected,1)
        self.assertEqual(len(stream.pending),0)
        self.assertEqual(list(Lines().feed(b'x'*4096+b'\n')),[b'x'*4096])

    def test_noise_never_raises_or_grows_buffer(self):
        rng=random.Random(140)
        parser=Lines()
        for _ in range(2000):
            chunk=rng.randbytes(rng.randrange(1,200))
            for line in parser.feed(chunk):
                self.assertIsNone(decode_line(line,'marauder',NOW))
                self.assertIsNone(decode_line(line,'remoteid-json',NOW))
            self.assertLessEqual(len(parser.pending),4096)

    def test_raw_json_requires_valid_payload_and_fresh_time(self):
        record={'schema_version':1,'protocol':'wifi-beacon','mac':MAC,'received_at':NOW,
                'payload_hex':pack(basic(),location()).hex()}
        self.assertEqual(decode_line(json.dumps(record).encode(),'remoteid-json',NOW)['type'],'rid')
        for changes in ({'received_at':NOW-121},{'payload_hex':'00'*25},{'operator_latitude':38},{'mac':'ff:ff:ff:ff:ff:ff'}):
            self.assertIsNone(decode_line(json.dumps({**record,**changes}).encode(),'remoteid-json',NOW))

    def test_local_ports_only_and_baud_validation(self):
        for port in ('COM1','COM123','/dev/ttyUSB0','/dev/ttyACM1','/dev/cu.usbserial-1420'):
            self.assertTrue(valid_port(port))
        for port in ('socket://localhost:1234','/etc/passwd','/dev/ttyUSB0/../tty0','COM0','COM1\n',{},None):
            self.assertFalse(valid_port(port))
        for values in ({'serial_baud':True},{'serial_baud':1},{'serial_format':'guess'},{'serial_port':'rfc2217://x'}):
            with self.assertRaises(ValueError):validate_settings(values)

    @patch('dronemapper_node.engine.Engine._maintenance',lambda self:None)
    @patch('time.time',return_value=NOW)
    def test_legacy_csv_cannot_upload_or_become_position_even_when_sharing(self,_):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);store.config['token']='test-offline'
            store.update({**store.settings(),'share_rid':True,'share_areas':True,'share_decoded':True,'station':[37,-122]})
            engine=Engine(store)
            try:
                engine.ingest({**marauder(rid_line(),NOW),'source':'serial:COM1'})
                contact=engine.snapshot()['contacts'][0]
                self.assertEqual(contact['kind'],'drone')
                self.assertNotIn('distance_m',contact)
                self.assertNotIn('latitude',contact)
                self.assertEqual(store.counts(),{})
                with patch('time.time',return_value=NOW+121):self.assertEqual(engine.snapshot()['contacts'],[])
            finally:engine.close();store.close()

    @patch('dronemapper_node.engine.Engine._maintenance',lambda self:None)
    @patch('time.time',return_value=NOW)
    def test_raw_json_uses_existing_upload_validation_and_consent(self,_):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);store.config['token']='test-offline'
            engine=Engine(store)
            try:
                raw={'schema_version':1,'protocol':'ble','mac':MAC,'received_at':NOW,'payload_hex':pack(basic(),location()).hex()}
                row=decode_line(json.dumps(raw).encode(),'remoteid-json',NOW)
                engine.ingest({**row,'source':'serial:COM1'})
                self.assertEqual(store.counts(),{'local':1})
                store.update({**store.settings(),'share_rid':True})
                raw.update(received_at=NOW+6,payload_hex=pack(basic(),location(NOW+6)).hex())
                with patch('time.time',return_value=NOW+6):
                    engine.ingest({**decode_line(json.dumps(raw).encode(),'remoteid-json',NOW+6),'source':'serial:COM1'})
                self.assertEqual(store.counts(),{'local':1,'queued':1})
                record=store.batch(now=NOW+6)[0]
                self.assertNotIn('mac',record)
                self.assertNotIn('source',record)
                self.assertEqual(record['observed_at'],NOW+6)
            finally:engine.close();store.close()

    @patch('dronemapper_node.engine.Engine._maintenance',lambda self:None)
    def test_connect_disconnect_preserves_other_receivers_and_consent(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);store.update({**store.settings(),'wifi_interfaces':['dmmon0'],'share_rid':True})
            engine=Engine(store);started=threading.Event()
            def wifi(interface,stop,emit,status):stop.wait()
            def serial(port,baud,format,stop,emit,status):started.set();stop.wait()
            try:
                with patch('dronemapper_node.engine.radios.wifi',wifi),patch('dronemapper_node.serial_receiver.receive',serial),patch('dronemapper_node.serial_receiver.ports',return_value=[{'port':'COM3'}]):
                    engine.start()
                    with self.assertRaises(ValueError):engine.connect_serial({'serial_port':'COM9'})
                    self.assertTrue(engine.running)
                    engine.connect_serial({'serial_port':'COM3'})
                    self.assertTrue(started.wait(1));self.assertEqual(len(engine.threads),2)
                    engine.connect_serial({'serial_port':''})
                    self.assertEqual(len(engine.threads),1);self.assertTrue(engine.running)
                    self.assertTrue(store.settings()['share_rid'])
            finally:engine.close();store.close()

    @unittest.skipUnless(os.name=='posix' and importlib.util.find_spec('serial'),'pyserial and POSIX required')
    def test_real_serial_stream_partial_lines_duplicates_and_clean_stop(self):
        import pty
        master,slave=pty.openpty();port=os.ttyname(slave)
        stop=threading.Event();connected=threading.Event();rows=[];errors=[]
        def status(text):
            if text.startswith('Connected'):connected.set()
        def reader():
            try:receive(port,115200,'marauder',stop,rows.append,status)
            except Exception as error:errors.append(error)
        try:
            with patch('dronemapper_node.serial_receiver.valid_port',return_value=True),patch('dronemapper_node.serial_receiver.ports',return_value=[{'port':port}]):
                worker=threading.Thread(target=reader);worker.start()
                self.assertTrue(connected.wait(2),errors)
                os.write(master,b'boot log\n'+rid_line()[:20]);time.sleep(.03)
                os.write(master,rid_line()[20:]+b'\n'+rid_line()+b'\n'+rid_line(**{'0':3000,'6':8})+b'\n')
                deadline=time.monotonic()+2
                while len(rows)<2 and time.monotonic()<deadline:time.sleep(.01)
                stop.set();worker.join(2)
                self.assertFalse(worker.is_alive())
                self.assertEqual(errors,[])
                self.assertEqual([row['packet_count'] for row in rows],[7,8])
        finally:
            stop.set();os.close(master);os.close(slave)


if __name__=='__main__':unittest.main()
