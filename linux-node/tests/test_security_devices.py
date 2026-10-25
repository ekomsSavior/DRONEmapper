"""Synthetic receiver tests; these packets are never sent or published."""
import ctypes
import ctypes.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node.security_devices import vendor_hint, ethernet_arp, REFERENCES
from dronemapper_node import network_receiver
from dronemapper_node.protocol import PcapStream, wifi_frame
from dronemapper_node.engine import Engine, Catalog
from dronemapper_node.storage import Store, validate_settings

NOW=1800000100.0
MAC='E0:A7:00:00:00:01'  # Invented fixture; not the redacted photo address.

def arp(sender=MAC,target='00:11:22:33:44:55',tags=0,op=1):
    src=bytes.fromhex(sender.replace(':',''));dst=bytes.fromhex(target.replace(':',''))
    ethernet=bytes.fromhex('ffffffffffff')+src+b'\x81\x00\x00\x01'*tags+b'\x08\x06'
    return ethernet+struct.pack('!HHBBH',1,0x800,6,4,op)+src+bytes([192,0,2,1])+dst+bytes([192,0,2,2])

def pcap(packet,stamp=NOW):
    return struct.pack('<IHHIIII',0xa1b2c3d4,2,4,0,0,96,1)+struct.pack('<IIII',int(stamp),0,len(packet),len(packet))+packet

def beacon(mac=MAC,ssid=b'Fixture',subtype=0x80):
    frame=bytearray(36);frame[0]=subtype;frame[10:16]=bytes.fromhex(mac.replace(':',''))
    return bytes(frame)+bytes([0,len(ssid)])+ssid

class ReferenceTests(unittest.TestCase):
    def test_shared_catalog_and_bundled_allocation(self):
        repo=Path(__file__).resolve().parents[2]
        bundled=Path(__file__).resolve().parents[1]/'dronemapper_node/data/security-device-references.json'
        canonical=bundled.read_bytes()
        for copy in ('integration/security-device-references.json','android-node/app/src/main/assets/security-device-references.json'):
            if (repo/copy).exists(): self.assertEqual((repo/copy).read_bytes(),canonical)
        catalog=Catalog()
        for vendor in REFERENCES['vendors']:
            for prefix in vendor['prefixes']:
                self.assertIn(vendor['name'],catalog.oui[prefix])
        self.assertEqual(vendor_hint(MAC)['vendor_name'],'Verkada')
        for invalid in (None,{},'E0:A7:00','E0:A7:01:00:00:01','E2:A7:00:00:00:01','E1:A7:00:00:00:01','FF:FF:FF:FF:FF:FF'):
            self.assertIsNone(vendor_hint(invalid))
        self.assertNotIn('model',vendor_hint(MAC))
        self.assertIn('model unknown',vendor_hint(MAC)['identification'])
        self.assertEqual(catalog.vendor('bad'),'Unknown radio vendor')
        self.assertIn('unknown',catalog.vendor('E1:A7:00:00:00:01'))

    def test_only_observed_arp_senders_are_matched(self):
        for tags in range(3):
            for op in (1,2):
                match=ethernet_arp(arp(tags=tags,op=op))
                self.assertEqual(match['mac'],MAC)
                self.assertEqual(set(match),{'mac','protocol','vendor_id','vendor_name','vendor_url','identification'})
        self.assertIsNone(ethernet_arp(arp(sender='00:11:22:33:44:55',target=MAC)))
        for packet in (arp(tags=3),arp(op=3),arp()[:-1],arp()[:14]+b'\x00\x02'+arp()[16:],arp()[:22]+bytes(6)+arp()[28:]):
            self.assertIsNone(ethernet_arp(packet))
        for length in range(42):self.assertIsNone(ethernet_arp(arp()[:length]))

    def test_probe_responses_add_hints_not_remote_id(self):
        for control in (0x80,0x50):
            match=wifi_frame(beacon(subtype=control))[0]
            self.assertTrue(match['vendor_only']);self.assertNotIn('model',match)
            self.assertEqual(len(wifi_frame(beacon(ssid=b''))),1)
            self.assertEqual(wifi_frame(beacon(mac='E2:A7:00:00:00:01',subtype=control)),[])
            candidate=wifi_frame(beacon(ssid=b'TELLO-ABC123',subtype=control))[0]
            self.assertEqual(candidate['signature'],'tello-name');self.assertNotIn('vendor_only',candidate)
        wire=beacon(subtype=0x50)+bytes([221,30])+b'\xfa\x0b\xbc\x0d\0'+bytes(25)
        self.assertFalse(any('payload' in x for x in wifi_frame(wire)))

    def test_ethernet_pcap_requires_explicit_receiver(self):
        with self.assertRaises(ValueError):PcapStream().feed(pcap(arp()))
        self.assertEqual(PcapStream(linktypes=(1,)).feed(pcap(arp())),[(NOW,arp(),1)])

    @unittest.skipUnless(ctypes.util.find_library('pcap'),'libpcap unavailable')
    def test_real_bpf_filters_untagged_and_vlan_arp(self):
        lib=ctypes.CDLL(ctypes.util.find_library('pcap'))
        class Program(ctypes.Structure):_fields_=[('length',ctypes.c_uint),('insns',ctypes.c_void_p)]
        class Header(ctypes.Structure):_fields_=[('seconds',ctypes.c_long),('micros',ctypes.c_long),('captured',ctypes.c_uint),('original',ctypes.c_uint)]
        lib.pcap_open_dead.argtypes=[ctypes.c_int,ctypes.c_int];lib.pcap_open_dead.restype=ctypes.c_void_p
        lib.pcap_compile.argtypes=[ctypes.c_void_p,ctypes.POINTER(Program),ctypes.c_char_p,ctypes.c_int,ctypes.c_uint]
        lib.pcap_offline_filter.argtypes=[ctypes.POINTER(Program),ctypes.POINTER(Header),ctypes.c_void_p]
        lib.pcap_freecode.argtypes=[ctypes.POINTER(Program)];lib.pcap_close.argtypes=[ctypes.c_void_p]
        capture=lib.pcap_open_dead(1,96);program=Program()
        try:
            self.assertEqual(lib.pcap_compile(capture,ctypes.byref(program),network_receiver.NETWORK_FILTER.encode(),1,0xffffffff),0)
            cases=[(arp(tags=n),True) for n in range(3)]+[(arp(tags=3),False),(arp()[:12]+b'\x08\x00'+arp()[14:],False),(bytes(10),False)]
            for packet,expected in cases:
                header=Header(0,0,len(packet),len(packet));buffer=ctypes.create_string_buffer(packet)
                self.assertEqual(bool(lib.pcap_offline_filter(ctypes.byref(program),ctypes.byref(header),buffer)),expected)
        finally:lib.pcap_freecode(ctypes.byref(program));lib.pcap_close(capture)

class ReceiverTests(unittest.TestCase):
    def test_interface_inventory_excludes_non_lan_capture_sources(self):
        result=subprocess.CompletedProcess([],0,'1. eth0 (Ethernet)\n2. wlp3s0\n3. any\n4. bluetooth0\n5. dbus-system\n6. nfqueue\n7. nflog\n8. lo\n','')
        with patch.object(network_receiver,'tool_path',return_value='/test/dumpcap'),patch.object(network_receiver.subprocess,'run',return_value=result):
            self.assertEqual(network_receiver.interfaces(),['eth0','wlp3s0'])

    @patch('time.time',return_value=NOW)
    def test_receiver_uses_nonpromiscuous_arp_only_and_drops_stale(self,_):
        events=[]
        with patch.object(network_receiver,'tool_path',return_value='/test/dumpcap'),patch.object(network_receiver,'interfaces',return_value=['eth0']),patch.object(network_receiver.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'1. EN10MB (Ethernet)','')),patch.object(network_receiver,'process_bytes',return_value=[pcap(arp())]) as capture:
            network_receiver.receive('eth0',threading.Event(),events.append,lambda x:None)
            command=capture.call_args.args[0]
            self.assertIn('-p',command);self.assertNotIn('-I',command)
            self.assertEqual(command[command.index('-f')+1],network_receiver.NETWORK_FILTER)
            self.assertEqual(command[-1],'-')
            self.assertEqual([e['type'] for e in events],['network-frame','vendor'])
            capture.return_value=[pcap(arp(),NOW-121)];events.clear()
            network_receiver.receive('eth0',threading.Event(),events.append,lambda x:None)
            self.assertEqual(events,[])

    def test_settings_default_off_and_no_monitor_conflict(self):
        self.assertEqual(validate_settings({})['lan_interface'],'')
        for value in ({'lan_interface':'-i'},{'lan_interface':{}},{'lan_interface':'dmmon0','wifi_interfaces':['dmmon0']}):
            with self.assertRaises(ValueError):validate_settings(value)
        self.assertEqual(validate_settings({'lan_interface':'eth0'})['lan_interface'],'eth0')

    @patch('time.time',return_value=NOW)
    def test_vendor_contacts_cannot_queue_or_acquire_location(self,_):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);engine=Engine(store)
            try:
                store.config['token']='x'*43
                store.update({**store.settings(),'station':[37.1,-122.1],'share_rid':True,'share_areas':True,'share_robots':True,'share_decoded':True})
                for protocol in ('ethernet-arp','wifi-beacon','wifi-probe-response'):
                    engine.ingest({'type':'vendor','mac':MAC,'protocol':protocol,'source':protocol,'received_at':NOW,'name':'Fixture','rssi_dbm':-42,'frequency_mhz':2437,'latitude':37.1,'longitude':-122.1,'model':'CM42'})
                view=engine.snapshot();self.assertEqual(len(view['network_devices']),1);self.assertEqual(len(view['contacts']),2)
                for contact in view['network_devices']+view['contacts']:
                    self.assertNotIn('latitude',contact);self.assertNotIn('model',contact);self.assertNotIn('distance_m',contact)
                    self.assertTrue(contact['local_only']);engine._queue(contact['key'],contact,NOW)
                self.assertNotIn('rssi_dbm',view['network_devices'][0])
                self.assertEqual(store.counts(),{})
                engine.ingest({'type':'vendor','mac':MAC,'protocol':'ethernet-arp','source':'ethernet-arp','received_at':NOW-1})
                self.assertEqual(engine.snapshot()['network_devices'][0]['seen'],NOW)
                with patch('time.time',return_value=NOW+121):
                    self.assertEqual(engine.snapshot()['network_devices'],[]);self.assertEqual(engine.snapshot()['contacts'],[])
            finally:engine.close();store.close()

    def test_lan_failure_does_not_stop_wifi(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);engine=Engine(store);started=threading.Event()
            store.update({**store.settings(),'wifi_interfaces':['dmmon0'],'lan_interface':'eth0'})
            def wifi(interface,stop,emit,status):started.set();stop.wait()
            try:
                with patch('dronemapper_node.engine.radios.wifi',wifi),patch.object(network_receiver,'receive',side_effect=RuntimeError('Test unavailable')):
                    engine.start();self.assertTrue(started.wait(2));self.assertTrue(engine.running)
                    engine.stop()
            finally:engine.close();store.close()

if __name__=='__main__':unittest.main()
