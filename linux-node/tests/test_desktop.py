"""Portable node contracts; no real radios, accounts or public-map writes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node import platform_support as platform
from dronemapper_node.radios import ble_event, ble_options, wifi
from dronemapper_node.processes import process_bytes
from dronemapper_node.capture import capture_iq
from dronemapper_node.storage import Store, validate_settings
from dronemapper_node.engine import Engine
from test_node import basic, location, pack, NOW


class DesktopTests(unittest.TestCase):
    def test_interfaces_accept_local_npcap_and_reject_remote_inputs(self):
        valid=r'\Device\NPF_{12345678-1234-1234-1234-123456789abc}'
        self.assertTrue(platform.valid_interface(valid))
        self.assertTrue(platform.valid_interface('en0'))
        self.assertTrue(platform.valid_interface('dmmon0'))
        for value in ('rpcap://host/a',r'\\.\pipe\test','TCP@127.0.0.1:1234','-i','a;exit',{}):
            self.assertFalse(platform.valid_interface(value))
        self.assertEqual(validate_settings({'wifi_interfaces':[valid],'ble_adapter':'default'})['ble_adapter'],'default')

    def test_ble_modes_match_platform_capabilities(self):
        with patch.object(platform,'system',return_value='Windows'),patch('dronemapper_node.radios.system',return_value='Windows'):
            self.assertEqual(ble_options('default'),{'scanning_mode':'passive'})
            with self.assertRaises(ValueError):ble_options('hci0')
        with patch('dronemapper_node.radios.system',return_value='Darwin'):
            options=ble_options('default')
            self.assertEqual(options['scanning_mode'],'active')
            self.assertIn('0000fffa-0000-1000-8000-00805f9b34fb',options['service_uuids'])
        with patch('dronemapper_node.radios.system',return_value='Linux'):
            self.assertEqual(ble_options('hci1')['bluez']['adapter'],'hci1')
            self.assertEqual(ble_options('hci1')['scanning_mode'],'passive')

    @patch('time.time',return_value=NOW)
    def test_macos_bluetooth_uuid_is_local_and_never_a_fake_mac(self,_):
        address='aebf67ee-40ad-4406-8a42-cff27226e0de'
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(tmp);engine=Engine(store)
            try:
                store.config['token']='x'*43
                store.update({**store.settings(),'share_rid':True})
                with patch('dronemapper_node.radios.system',return_value='Darwin'):
                    event=ble_event(address,b'\x0d\x00'+pack(basic(),location()),-40,'default')
                    self.assertIsNone(ble_event('not-an-id',b'\x0d\x00'+basic(),-40,'default'))
                engine.ingest(event)
                contact=engine.snapshot()['contacts'][0]
                self.assertEqual(contact['receiver_id'],address)
                self.assertNotIn('mac',contact)
                self.assertNotIn('radio_vendor',contact)
                pending=store.batch(NOW)
                self.assertEqual(len(pending),1)
                self.assertNotIn(address,json.dumps(pending))
                self.assertIn('rid',pending[0])
            finally:
                engine.close();store.close()

    def test_process_stream_binary_and_large_stderr_do_not_deadlock(self):
        data=[]
        command=[sys.executable,'-c','import os;os.write(2,b"x"*200000);os.write(1,bytes(range(256)))']
        with self.assertRaisesRegex(RuntimeError,'Receiver stopped'):
            data.extend(process_bytes(command,threading.Event()))
        self.assertEqual(b''.join(data),bytes(range(256)))

    def test_stop_interrupts_owned_receiver(self):
        stop=threading.Event()
        command=[sys.executable,'-u','-c','import time;print("ready",flush=True);time.sleep(60)']
        stream=process_bytes(command,stop)
        try:
            self.assertIn(b'ready',next(stream))
            started=time.monotonic();stop.set()
            self.assertEqual(list(stream),[])
            self.assertLess(time.monotonic()-started,6)
        finally:
            stream.close()

    def test_windows_capture_uses_binary_file_and_preserves_user_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'iq.cs8'
            def run(command,**kwargs):
                output=command[command.index('-r')+1]
                self.assertNotEqual(output,'-')
                self.assertNotIn('pass_fds',kwargs)
                self.assertNotIn('-t',command)
                Path(output).write_bytes(b'\x0a\x1a\xff\x00'*100)
                return subprocess.CompletedProcess(command,0)
            with patch('dronemapper_node.capture.system',return_value='Windows'),patch('dronemapper_node.capture.tool_path',return_value='hackrf_transfer.exe'),patch('dronemapper_node.capture.private_directory'),patch('subprocess.run',side_effect=run):
                report=capture_iq(target,2444.5,.1)
                self.assertEqual(report['samples'],200)
                self.assertEqual(target.read_bytes(),b'\x0a\x1a\xff\x00'*100)
                with self.assertRaises(FileExistsError):capture_iq(target,2444.5,.1)

    def test_nonnative_wifi_requests_monitor_and_refuses_ethernet(self):
        stop=threading.Event();events=[]
        details={'wifi':[{'name':'en0','mode':'unknown','channel':None}]}
        response=subprocess.CompletedProcess([],0,stdout='1. EN10MB (Ethernet)',stderr='')
        with patch('dronemapper_node.radios.system',return_value='Darwin'),patch('dronemapper_node.radios.doctor',return_value=details),patch('dronemapper_node.radios.tool_path',return_value='/Applications/Wireshark.app/Contents/MacOS/dumpcap'),patch('subprocess.run',return_value=response) as run:
            with self.assertRaisesRegex(RuntimeError,'does not expose monitor-mode'):
                wifi('en0',stop,events.append,lambda _:None)
            self.assertIn('-I',run.call_args.args[0])
            self.assertEqual(events,[])

    def test_state_directory_platform_defaults(self):
        with patch.object(platform,'system',return_value='Windows'),patch.dict(os.environ,{'LOCALAPPDATA':'test-local-app-data'}):
            self.assertEqual(platform.state_directory(),Path('test-local-app-data/DRONEmapper/node'))
        with patch.object(platform,'system',return_value='Darwin'):
            self.assertIn('Application Support',str(platform.state_directory()))

    @unittest.skipUnless(os.name=='nt','Windows ACL test runs on the Windows CI worker')
    def test_windows_state_dacl_protected_and_user_specific(self):
        import ctypes
        from ctypes import wintypes as w
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(tmp)
            store.close()
            api=ctypes.WinDLL('advapi32',use_last_error=True)
            api.GetFileSecurityW.argtypes=[w.LPCWSTR,w.DWORD,w.LPVOID,w.DWORD,ctypes.POINTER(w.DWORD)]
            api.GetFileSecurityW.restype=w.BOOL
            needed=w.DWORD()
            api.GetFileSecurityW(tmp,4,None,0,ctypes.byref(needed))
            buffer=ctypes.create_string_buffer(needed.value)
            self.assertTrue(api.GetFileSecurityW(tmp,4,buffer,needed,ctypes.byref(needed)))
            api.ConvertSecurityDescriptorToStringSecurityDescriptorW.argtypes=[w.LPVOID,w.DWORD,w.DWORD,ctypes.POINTER(w.LPWSTR),ctypes.POINTER(w.DWORD)]
            api.ConvertSecurityDescriptorToStringSecurityDescriptorW.restype=w.BOOL
            text=w.LPWSTR()
            self.assertTrue(api.ConvertSecurityDescriptorToStringSecurityDescriptorW(buffer,1,4,ctypes.byref(text),None))
            try:
                self.assertIn('D:P',text.value)
                self.assertIn(platform.windows_sid(),text.value)
                self.assertNotIn(';;;WD)',text.value)
            finally:
                kernel=ctypes.WinDLL('kernel32');kernel.LocalFree.argtypes=[w.LPVOID]
                kernel.LocalFree(ctypes.cast(text,w.LPVOID))


if __name__=='__main__':unittest.main()
