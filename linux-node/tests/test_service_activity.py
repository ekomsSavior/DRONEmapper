"""Offline fixtures only: no DNS packets, camera data or sightings are sent."""
import ctypes
import ctypes.util
import ipaddress
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dronemapper_node.service_activity import domain_hint, dns_question, ethernet_dns
from dronemapper_node import network_receiver
from dronemapper_node.engine import Engine
from dronemapper_node.storage import Store, validate_settings
from dronemapper_node.cli import parser

NOW = 1800000100.0


def question(name='carbyne.com', qtype=1, flags=0x0100):
    labels = b''.join(bytes([len(label)]) + label.encode() for label in name.split('.'))
    return struct.pack('!HHHHHH', 1, flags, 1, 0, 0, 0) + labels + b'\0' + struct.pack('!HH', qtype, 1)


def packet(payload=None, version=4, tags=0, destination=53, fragment=0, options=0):
    payload = question() if payload is None else payload
    udp = struct.pack('!HHHH', 53000, destination, 8 + len(payload), 0) + payload
    if version == 4:
        ip = struct.pack('!BBHHHBBH4s4s', 0x45 + options, 0, 20 + 4*options + len(udp), 1, fragment,
                         64, 17, 0, bytes([192, 0, 2, 1]), bytes([192, 0, 2, 2])) + bytes(4*options)
        ethertype = b'\x08\0'
    else:
        ip = struct.pack('!IHBB', 0x60000000, len(udp), 17, 64) + ipaddress.IPv6Address('2001:db8::1').packed * 2
        ethertype = b'\x86\xdd'
    return bytes.fromhex('001122334455020000000001') + b'\x81\0\0\1'*tags + ethertype + ip + udp


def pcap(wire):
    return struct.pack('<IHHIIII', 0xa1b2c3d4, 2, 4, 0, 0, 4192, 1) + struct.pack('<IIII', int(NOW), 0, len(wire), len(wire)) + wire


class DnsEvidenceTests(unittest.TestCase):
    def test_domain_boundary_and_data_minimization(self):
        for name in ('carbyne.com', 'CARBYNE.COM.', 'www.carbyne.com', 'tenant-example.carbyne.com'):
            hint = domain_hint(name)
            self.assertEqual(hint['domain'], 'carbyne.com')
            self.assertEqual(hint['service_id'], 'carbyne')
            self.assertNotIn('tenant-example', str(hint))
        for name in (None, {}, '104.19.154.92', 'evilcarbyne.com', 'carbyne.com.example',
                     'carbyne.com/secret', 'bad..carbyne.com', '-bad.carbyne.com', 'é.carbyne.com'):
            self.assertIsNone(domain_hint(name))
        result = ethernet_dns(packet(question('tenant-example.carbyne.com')))
        self.assertEqual(set(result), {'service_id', 'service_name', 'service_url', 'domain', 'identification', 'protocol', 'query_type'})
        self.assertEqual(result['query_type'], 'A')

    def test_queries_only_and_supported_encodings(self):
        for qtype, label in ((1, 'A'), (28, 'AAAA'), (64, 'SVCB'), (65, 'HTTPS')):
            self.assertEqual(dns_question(question(qtype=qtype))['query_type'], label)
        for flags in (0x8100, 0x7900, 0x0500, 0x0300, 0x0140, 0x0103):
            self.assertIsNone(dns_question(question(flags=flags)))
        self.assertIsNone(dns_question(question(qtype=15)))
        self.assertIsNone(dns_question(question()[:-2] + b'\0\3'))
        self.assertIsNone(dns_question(question()[:4] + b'\0\2' + question()[6:]))
        self.assertIsNone(dns_question(question()[:6] + b'\0\1' + question()[8:]))
        self.assertIsNone(dns_question(question()[:12] + b'\xc0\x0c\0\1\0\1'))
        self.assertIsNone(dns_question(question('x'*64 + '.carbyne.com')))
        self.assertIsNone(dns_question(question()[:12] + b'\x01\xff\0\0\1\0\1'))
        self.assertIsNone(dns_question(question() + bytes(4096)))

    def test_ip_vlan_and_fragment_boundaries(self):
        for version in (4, 6):
            for tags in range(3):
                wire = packet(version=version, tags=tags)
                self.assertIsNotNone(ethernet_dns(wire))
                for length in range(len(wire)):
                    self.assertIsNone(ethernet_dns(wire[:length]))
            self.assertIsNone(ethernet_dns(packet(version=version, tags=3)))
            self.assertIsNone(ethernet_dns(packet(version=version, destination=5353)))
        self.assertIsNotNone(ethernet_dns(packet(options=2, fragment=0x4000)))
        for fragment in (1, 0x2000, 0x8000):
            self.assertIsNone(ethernet_dns(packet(fragment=fragment)))
        wire = bytearray(packet()); wire[14] = 0x44
        self.assertIsNone(ethernet_dns(wire))
        wire = bytearray(packet(version=6)); wire[20] = 44
        self.assertIsNone(ethernet_dns(wire))
        wire = bytearray(packet()); wire[38:40] = b'\0\x08'
        self.assertIsNone(ethernet_dns(wire))

    @unittest.skipUnless(ctypes.util.find_library('pcap'), 'libpcap unavailable')
    def test_actual_capture_filter_allows_queries_without_expanding_default_capture(self):
        lib = ctypes.CDLL(ctypes.util.find_library('pcap'))
        class Program(ctypes.Structure): _fields_ = [('length', ctypes.c_uint), ('insns', ctypes.c_void_p)]
        class Header(ctypes.Structure): _fields_ = [('seconds', ctypes.c_long), ('micros', ctypes.c_long), ('captured', ctypes.c_uint), ('original', ctypes.c_uint)]
        lib.pcap_open_dead.argtypes = [ctypes.c_int, ctypes.c_int]; lib.pcap_open_dead.restype = ctypes.c_void_p
        lib.pcap_compile.argtypes = [ctypes.c_void_p, ctypes.POINTER(Program), ctypes.c_char_p, ctypes.c_int, ctypes.c_uint]
        lib.pcap_offline_filter.argtypes = [ctypes.POINTER(Program), ctypes.POINTER(Header), ctypes.c_void_p]
        lib.pcap_freecode.argtypes = [ctypes.POINTER(Program)]; lib.pcap_close.argtypes = [ctypes.c_void_p]
        capture = lib.pcap_open_dead(1, 4192)
        try:
            for enabled in (False, True):
                program = Program()
                expression = network_receiver.NETWORK_FILTER
                if enabled: expression = f'({expression}) or ({network_receiver.DNS_FILTER})'
                self.assertEqual(lib.pcap_compile(capture, ctypes.byref(program), expression.encode(), 1, 0xffffffff), 0)
                try:
                    cases = [(packet(version=v, tags=t), enabled) for v in (4, 6) for t in range(3)]
                    cases += [(packet(options=2), enabled), (packet(fragment=0x4000), enabled), (bytes(10), False)]
                    cases += [(packet(tags=3), False), (packet(destination=443), False), (packet(fragment=0x2000), False)]
                    for wire, expected in cases:
                        header = Header(0, 0, len(wire), len(wire)); buf = ctypes.create_string_buffer(wire)
                        self.assertEqual(bool(lib.pcap_offline_filter(ctypes.byref(program), ctypes.byref(header), buf)), expected)
                finally: lib.pcap_freecode(ctypes.byref(program))
        finally: lib.pcap_close(capture)

    @patch('time.time', return_value=NOW)
    def test_receiver_requires_opt_in(self, _):
        events = []
        with patch.object(network_receiver, 'tool_path', return_value='/test/dumpcap'), patch.object(network_receiver, 'interfaces', return_value=['eth0']), patch.object(network_receiver.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '1. EN10MB', '')), patch.object(network_receiver, 'process_bytes', return_value=[pcap(packet())]) as capture:
            network_receiver.receive('eth0', threading.Event(), events.append, lambda x: None)
            self.assertFalse(any(e['type'] == 'service-domain' for e in events))
            events.clear()
            network_receiver.receive('eth0', threading.Event(), events.append, lambda x: None, dns=True)
            self.assertEqual([e['type'] for e in events], ['network-frame', 'service-domain'])
            command = capture.call_args.args[0]
            self.assertIn('-p', command); self.assertNotIn('-I', command)
            self.assertIn(network_receiver.DNS_FILTER, command[command.index('-f')+1])

    def test_settings_and_cli_default_off(self):
        self.assertFalse(validate_settings({})['lan_dns'])
        self.assertIsNone(parser().parse_args(['configure']).lan_dns)
        self.assertTrue(parser().parse_args(['configure', '--lan-dns']).lan_dns)
        self.assertFalse(parser().parse_args(['configure', '--no-lan-dns']).lan_dns)
        for value in (1, None, 'true'):
            with self.assertRaises(ValueError): validate_settings({'lan_dns': value})

    @patch('time.time', return_value=NOW)
    def test_service_never_becomes_device_position_or_upload(self, _):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(directory); engine = Engine(store)
            event = {**ethernet_dns(packet()), 'type': 'service-domain', 'source': 'lan:eth0', 'received_at': NOW,
                     'latitude': 32.08, 'longitude': 34.78, 'mac': '00:11:22:33:44:55', 'model': 'Drone', 'rssi_dbm': -42}
            try:
                engine.ingest(event)
                self.assertEqual(engine.snapshot()['service_activity'], [])
                engine.configure({'lan_interface': 'eth0', 'lan_dns': True, 'station': [32.08, 34.78], 'share_rid': True, 'share_areas': True, 'share_robots': True, 'share_decoded': True})
                engine.ingest({**event, 'source': 'mqtt:test'})
                self.assertEqual(engine.snapshot()['service_activity'], [])
                engine.ingest(event)
                view = engine.snapshot()
                self.assertEqual(view['contacts'], []); self.assertEqual(view['network_devices'], [])
                self.assertEqual(len(view['service_activity']), 1)
                item = view['service_activity'][0]
                for field in ('latitude', 'longitude', 'mac', 'model', 'rssi_dbm', 'bearing', 'distance_m'):
                    self.assertNotIn(field, item)
                self.assertTrue(item['local_only'])
                engine._queue(item['key'], item, NOW)
                self.assertEqual(store.counts(), {})
                engine.ingest({**event, 'received_at': NOW-1})
                self.assertEqual(engine.snapshot()['service_activity'][0]['seen'], NOW)
                with patch('time.time', return_value=NOW+121):
                    self.assertEqual(engine.snapshot()['service_activity'], [])
                    self.assertEqual(engine.service_activity, {})
                engine.configure({'lan_dns': False})
                self.assertEqual(engine.snapshot()['service_activity'], [])
            finally: engine.close(); store.close()


if __name__ == '__main__': unittest.main()
