#!/usr/bin/env python3
"""Upload completed WiGLE CSV exports. Church of Malware / saviorSEC, AGPL-3.0-or-later."""
import argparse
import csv
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = 'https://dronemapper.churchofmalware.org/v1/wardrives'
REQUIRED = {'mac', 'ssid', 'firstseen', 'rssi', 'currentlatitude', 'currentlongitude', 'type'}
PATTERN = re.compile(r'WIFI_(?:[248]K|CAM|FPV)[_-]+[A-Z0-9_-]{3,32}', re.I)
csv.field_size_limit(4096)


def candidate(row):
    return row.get('type', '').strip().upper() == 'WIFI' and bool(
        PATTERN.fullmatch(row.get('ssid', '')) or re.fullmatch(r'TELLO-[A-Z0-9]{6}', row.get('ssid', '')))


def batches(path):
    """Filter locally; omit file metadata and unrelated Wi-Fi/Bluetooth rows."""
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 256 * 1024 * 1024:
        raise ValueError('Choose a regular completed CSV file no larger than 256 MiB.')
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream, strict=True)
        header = next(reader, [])
        if header and header[0].startswith('WigleWifi-'):
            header = next(reader, [])
        normalized = [v.strip().lower() for v in header]
        if (len(set(normalized)) != len(normalized) or len(header) > 40 or
                not REQUIRED.issubset(normalized) or not {'channel', 'frequency'}.intersection(normalized)):
            raise ValueError('Expected a WiGLE-format CSV header.')
        pending = []
        for row in reader:
            if not row:
                continue
            if len(row) != len(header):
                raise ValueError('Malformed CSV row. Re-export the completed session.')
            if candidate(dict(zip(normalized, row))):
                pending.append(row)
            if len(pending) >= 100:  # Bounds SQL work and body size, even for long fields.
                yield encode_csv(header, pending)
                pending = []
        if pending:
            yield encode_csv(header, pending)


def encode_csv(header, rows):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(header)
    writer.writerows(rows)
    data = stream.getvalue().encode('utf-8')
    if len(data) > 2 * 1024 * 1024:
        raise ValueError('CSV batch too large.')
    return data


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Upload redirected; check the configured endpoint. Token was not forwarded.')


def validate_url(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError('Use an HTTPS upload endpoint without credentials, query or fragment.')
    return url


def token_from_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Use a private, regular token file.')
    if os.name != 'nt' and (path.stat().st_mode & 0o077 or path.stat().st_uid != os.getuid()):
        raise ValueError('Token file must belong to you and have mode 600: chmod 600 YOUR_TOKEN_FILE')
    token = path.read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{64}', token):
        raise ValueError('Invalid upload token file.')
    return token


def save_token(path):
    token = getpass.getpass('Paste your DRONEmapper wardrive upload token (hidden): ').strip()
    if not re.fullmatch(r'[a-f0-9]{64}', token):
        raise ValueError('Expected a DRONEmapper wardrive token.')
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(token + '\n')
    print('Token saved. Keep this file private; do not share it with logs.')


def send(data, token, url, timezone):
    request = urllib.request.Request(url, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'text/csv',
        'X-Wardrive-Timezone': timezone, 'User-Agent': 'DRONEmapper-Wardrive-Uploader/1.0'})
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(4):
        try:
            with opener.open(request, timeout=30) as response:
                result = json.loads(response.read(16384))
                if response.status != 200 or not isinstance(result.get('accepted'), int):
                    raise ValueError('Unexpected upload response; file was not marked complete.')
                return result
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise PermissionError('Token rejected. Create or check your wardrive upload token.') from None
            if exc.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(60 if exc.code == 429 else 5 * (attempt + 1))
                continue
            raise ValueError(f'Upload failed (HTTP {exc.code}); file was not marked complete.') from None


def digest_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError('Choose a regular file.')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def upload(path, token, url, timezone):
    before = (path.stat().st_size, path.stat().st_mtime_ns)
    totals = {'accepted': 0, 'duplicates': 0, 'invalid': 0, 'outside_time_window': 0}
    for index, data in enumerate(batches(path)):
        if index:
            time.sleep(11)
        result = send(data, token, url, timezone)
        for key in totals:
            totals[key] += result.get(key, 0)
    if before != (path.stat().st_size, path.stat().st_mtime_ns):
        raise ValueError('File changed during upload. Retry after recording stops; duplicate reports are skipped.')
    print('Upload complete: ' + ', '.join(f'{key}={value}' for key, value in totals.items()), flush=True)
    return totals


def watch(directory, token, url, timezone, interval, state_path):
    if not directory.is_dir():
        raise ValueError('Watch directory does not exist.')
    if state_path.is_symlink():
        raise ValueError('State file cannot be a symlink.')
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    previous = {}
    identity = hashlib.sha256((url + ':' + token).encode()).hexdigest()
    print('Watching completed exports. Files must be unchanged across two checks; Ctrl+C stops.', flush=True)
    while True:
        current = {}
        for path in sorted(directory.iterdir()):
            if path.suffix.lower() not in {'.csv', '.wiglecsv', '.log'} or path.is_symlink() or not path.is_file():
                continue
            meta = (path.stat().st_size, path.stat().st_mtime_ns)
            current[str(path)] = meta
            if previous.get(str(path)) != meta or time.time() - path.stat().st_mtime < interval:
                continue
            key = hashlib.sha256((identity + ':' + str(path.resolve())).encode()).hexdigest()
            try:
                if meta[0] > 256 * 1024 * 1024:
                    raise ValueError('File exceeds 256 MiB.')
                digest = digest_file(path)
                if state.get(key) == digest:
                    continue
                upload(path, token, url, timezone)
                state[key] = digest
                # Only hashes are stored. No network names, coordinates or token.
                descriptor = os.open(state_path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                with os.fdopen(descriptor, 'w') as stream:
                    json.dump(state, stream)
            except PermissionError:
                raise
            except (ValueError, OSError, csv.Error) as exc:
                print('Export not completed: ' + str(exc), file=sys.stderr, flush=True)
        previous = current
        time.sleep(interval)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--save-token', type=Path, metavar='PRIVATE_FILE')
    mode.add_argument('--file', type=Path, metavar='COMPLETED_CSV')
    mode.add_argument('--watch', type=Path, metavar='EXPORT_FOLDER')
    parser.add_argument('--token-file', type=Path)
    parser.add_argument('--url', default=DEFAULT_URL)
    parser.add_argument('--timezone', default='UTC', help='Timezone of unzoned timestamps: UTC or numeric offset, e.g. --timezone=-07:00')
    parser.add_argument('--interval', type=int, default=60)
    parser.add_argument('--state', type=Path)
    parser.add_argument('--consent', action='store_true', help='Contribute matching signal areas from your permitted logs')
    args = parser.parse_args(argv)
    if args.save_token:
        save_token(args.save_token)
        return
    if not args.consent or not args.token_file:
        parser.error('Uploads require --consent and --token-file.')
    if not re.fullmatch(r'UTC|[+-](?:0\d|1[0-4]):[0-5]\d', args.timezone) or re.match(r'^[+-]14:(?!00)', args.timezone):
        parser.error('Use UTC or a numeric timezone offset.')
    url = validate_url(args.url)
    token = token_from_file(args.token_file)
    if args.file:
        upload(args.file, token, url, args.timezone)
    else:
        watch(args.watch, token, url, args.timezone, max(10, args.interval), args.state or args.watch / '.dronemapper-upload-state.json')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nUploader stopped.')
    except (ValueError, OSError, csv.Error) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
