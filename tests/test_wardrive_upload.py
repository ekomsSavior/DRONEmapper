import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('wardrive_upload', Path(__file__).parents[1] / 'scripts/wardrive-upload.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
HEADER = 'MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type\n'
ROW = 'C0:18:82:17:38:A0,WIFI_8K_abc,[OPEN],2026-10-19 00:00:00,6,-55,37.1,-122.1,5,5,WIFI\n'


class UploaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'completed.csv'

    def test_local_filter_and_chunks(self):
        self.file.write_text('WigleWifi-1.6,model=private-phone\n' + HEADER + ROW * 205 + ROW.replace('WIFI_8K_abc', 'My home, wifi').replace('My home, wifi', '"My home, wifi"'))
        chunks = list(u.batches(self.file))
        self.assertEqual(len(chunks), 3)
        self.assertNotIn(b'My home', b''.join(chunks))
        self.assertNotIn(b'private-phone', b''.join(chunks))
        self.assertEqual(sum(len(list(u.csv.reader(io.StringIO(c.decode())))) - 1 for c in chunks), 205)

    def test_malformed_header_row_and_symlink(self):
        self.file.write_text(HEADER + 'short,row\n')
        with self.assertRaises(ValueError):
            list(u.batches(self.file))
        self.file.write_text('MAC,SSID\n')
        with self.assertRaises(ValueError):
            list(u.batches(self.file))
        link = self.root / 'linked.csv'
        link.symlink_to(self.file)
        with self.assertRaises(ValueError):
            list(u.batches(link))

    def test_private_token_and_endpoint(self):
        path = self.root / 'token'
        with patch.object(u.getpass, 'getpass', return_value='a' * 64):
            u.save_token(path)
        self.assertEqual(u.token_from_file(path), 'a' * 64)
        with self.assertRaises(FileExistsError), patch.object(u.getpass, 'getpass', return_value='b' * 64):
            u.save_token(path)
        if u.os.name != 'nt':
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                u.token_from_file(path)
        for url in ['http://example.test/v1/wardrives', 'https://user:pass@example.test/', 'https://example.test/?token=secret']:
            with self.assertRaises(ValueError):
                u.validate_url(url)
        with self.assertRaises(ValueError):
            u.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test/')

    def test_http_retry_then_success_and_revoked_key_stops(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{"accepted":1,"duplicates":0}'
        class Opener:
            calls = 0
            def open(self, request, timeout):
                self.calls += 1
                self.request = request
                if self.calls == 1:
                    raise urllib.error.HTTPError('https://example.test/', 429, 'busy', {}, None)
                return Response()
        opener = Opener()
        with patch.object(u.urllib.request, 'build_opener', return_value=opener), patch.object(u.time, 'sleep') as sleep:
            self.assertEqual(u.send(b'csv', 'a' * 64, u.DEFAULT_URL, 'UTC')['accepted'], 1)
            sleep.assert_called_once_with(60)
            self.assertEqual(opener.request.get_header('Authorization'), 'Bearer ' + 'a' * 64)
        with patch.object(u.urllib.request, 'build_opener') as factory:
            factory.return_value.open.side_effect = urllib.error.HTTPError(u.DEFAULT_URL, 401, 'revoked', {}, None)
            with self.assertRaises(PermissionError):
                u.send(b'csv', 'a' * 64, u.DEFAULT_URL, 'UTC')

    def test_changing_file_is_not_completed(self):
        self.file.write_text(HEADER + ROW)
        def mutate(*args):
            self.file.write_text(HEADER + ROW * 2)
            return {'accepted': 1}
        with patch.object(u, 'send', side_effect=mutate):
            with self.assertRaisesRegex(ValueError, 'changed'):
                u.upload(self.file, 'a' * 64, u.DEFAULT_URL, 'UTC')

    def test_watcher_waits_for_stability_and_skips_completed_file(self):
        self.file.write_text(HEADER + ROW)
        u.os.utime(self.file, (1, 1))
        state_path = self.root / '.state.json'
        calls = 0
        def stop_after_three(*args):
            nonlocal calls
            calls += 1
            if calls == 3: raise KeyboardInterrupt
        with patch.object(u, 'upload', return_value={'accepted': 1}) as upload, patch.object(u.time, 'sleep', side_effect=stop_after_three):
            with self.assertRaises(KeyboardInterrupt):
                u.watch(self.root, 'a' * 64, u.DEFAULT_URL, 'UTC', 10, state_path)
            upload.assert_called_once()
        state = state_path.read_text()
        self.assertEqual(len(json.loads(state)), 1)
        for private in ['WIFI_8K_abc', 'C0:18', 'a' * 64, str(self.file)]:
            self.assertNotIn(private, state)


if __name__ == '__main__':
    unittest.main()
