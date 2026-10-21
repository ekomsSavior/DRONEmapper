"""Synthetic advertisements; never sent to radio hardware or the public map."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
import tempfile
import time
import unittest
from unittest.mock import patch
from dronemapper_node.robot_signals import robot_signature, CYBERDOG_UUID
from dronemapper_node.radios import ble_identity, ble_options
from dronemapper_node.engine import Engine
from dronemapper_node.storage import Store, validate_settings

class RobotTests(unittest.TestCase):
    def test_requires_name_uuid_and_manufacturer_bytes(self):
        good=('铁蛋TEST',[CYBERDOG_UUID],{65535:bytes(range(5))})
        self.assertEqual(robot_signature(*good),'cyberdog-ble-v1')
        self.assertEqual(robot_signature('铁蛋TEST\n',good[1],good[2]),'cyberdog-ble-v1')
        for value in [('CyberDog',good[1],good[2]),('铁蛋',good[1],good[2]),(good[0],[],good[2]),
                      (good[0],['0000ffe0-0000-1000-8000-00805f9b34fb'],good[2]),
                      (good[0],good[1],{}),(good[0],good[1],{65535:b'\0\1\2\3'}),
                      ('铁蛋TEST\n\n',good[1],good[2])]:
            self.assertIsNone(robot_signature(*value))

    def test_platform_filters_keep_remote_id(self):
        with patch('dronemapper_node.radios.system',return_value='Linux'):
            options=ble_options('hci1')
            self.assertEqual(options['scanning_mode'],'passive')
            self.assertIn((0,0x16,b'\xfa\xff'),options['bluez']['or_patterns'])
            self.assertIn((0,0x03,b'\x20\xc4'),options['bluez']['or_patterns'])
        with patch('dronemapper_node.radios.system',return_value='Darwin'):
            self.assertIn(CYBERDOG_UUID,ble_options('default')['service_uuids'])
            self.assertEqual(ble_identity('12345678-1234-1234-1234-123456789abc')['receiver_id'],'12345678-1234-1234-1234-123456789abc')

    def test_robot_sharing_is_separate_coarse_and_revocable(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);engine=Engine(store)
            try:
                store.config['token']='test-only';store.update({**store.settings(),'station':[37.123456,-122.123456],'share_areas':True})
                event={'type':'robot-candidate','source':'ble:hci0','mac':'00:11:22:33:44:55','signature':'cyberdog-ble-v1','received_at':time.time(),'rssi_dbm':-50}
                engine.ingest(event)
                contact=engine.snapshot()['contacts'][0]
                self.assertEqual(contact['kind'],'possible-robot')
                self.assertNotIn('latitude',contact);self.assertNotIn('bearing',contact)
                self.assertEqual(store.batch(),[])
                store.update({**store.settings(),'share_robots':True})
                engine.last_queued.clear();engine.ingest({**event,'received_at':time.time()+.1})
                row=store.batch()[0]
                self.assertEqual(row['observation_type'],'ble-robot-candidate')
                self.assertAlmostEqual(row['latitude'],37.125)
                self.assertAlmostEqual(row['longitude'],-122.125)
                for key in ('mac','receiver_id','name','ssid','frequency_mhz','manufacturer','model'):
                    self.assertNotIn(key,row)
                store.update({**store.settings(),'share_robots':False})
                self.assertEqual(store.batch(),[])
            finally:
                engine.close();store.close()

    def test_robot_sharing_requires_station(self):
        self.assertFalse(validate_settings({})['share_robots'])
        with self.assertRaises(ValueError): validate_settings({'share_robots':True})

    def test_cli_exposes_independent_robot_consent(self):
        from dronemapper_node.cli import parser
        self.assertIsNone(parser().parse_args(['configure']).share_robots)
        self.assertTrue(parser().parse_args(['configure','--share-robots']).share_robots)
        self.assertFalse(parser().parse_args(['configure','--no-share-robots']).share_robots)

if __name__=='__main__': unittest.main()
