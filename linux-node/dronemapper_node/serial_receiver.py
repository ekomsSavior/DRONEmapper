"""Bounded, receive-only USB serial input for external Remote ID receivers.
AGPL-3.0-or-later. Marauder RID CSV describes receiver state, not fresh GPS fixes.
"""
import csv
import re
import time
from .protocol import finite, messages

BAUDS = (9600, 57600, 115200, 230400, 460800, 921600)
FORMATS = ('marauder', 'remoteid-json')


def valid_port(value):
    return isinstance(value, str) and (value == '' or bool(re.fullmatch(
        r'(?:COM[1-9][0-9]{0,3}|/dev/tty(?:USB|ACM)[0-9]{1,3}|/dev/(?:cu|tty)\.[A-Za-z0-9_-]{1,100})', value)))


def ports():
    try:
        from serial.tools.list_ports import comports
    except ImportError:
        return []
    result = []
    for port in comports():
        if not valid_port(port.device) or not port.device:
            continue
        # USB serial numbers and arbitrary manufacturer descriptions are not exported.
        usb = f'{port.vid:04x}:{port.pid:04x}' if port.vid is not None and port.pid is not None else None
        result.append({'port': port.device, 'usb_id': usb})
    return sorted(result, key=lambda row: row['port'])[:64]


class Lines:
    """Discard an oversized entire line; never parse a valid-looking truncated suffix."""
    def __init__(self):
        self.pending = bytearray()
        self.dropping = False
        self.rejected = 0

    def feed(self, chunk):
        for value in chunk:
            if value == 10:
                if not self.dropping:
                    yield bytes(self.pending).rstrip(b'\r')
                self.pending.clear()
                self.dropping = False
            elif not self.dropping:
                if len(self.pending) == 4096:
                    self.pending.clear()
                    self.dropping = True
                    self.rejected += 1
                else:
                    self.pending.append(value)


def marauder(line, now):
    if not line.startswith(b'RID,'):
        return None
    try:
        fields = next(csv.reader([line.decode('ascii')], strict=True))
        if len(fields) != 31:
            return None
        f = fields[1:]
        if any(any(ord(c) < 32 or ord(c) > 126 for c in field) for field in f):
            return None
        if not re.fullmatch(r'[A-Za-z0-9:._-]{1,20}', f[1]) or f[8] not in ('active', 'lost'):
            return None
        numbers = {}
        for index in (0,3,4,5,6,9,10,11,12,16,18,20,21,22,25,26,27,28,29):
            if not re.fullmatch(r'-?[0-9]{1,10}', f[index]):
                return None
            numbers[index] = int(f[index])
        for index in (7,13,14,15,17,19,23,24):
            numbers[index] = float(f[index])
            if not finite(numbers[index], -1e10, 1e10):
                return None
        if (not 0 <= numbers[0] <= 0xffffffff or not 1 <= numbers[3] <= 15
                or not 0 <= numbers[4] <= 196 or not -127 <= numbers[5] <= 20
                or not 1 <= numbers[6] <= 0xffffffff or not 0 <= numbers[7] <= 1e6
                or any(numbers[i] not in (0,1) for i in (16,18,20,22))
                or not -90 <= numbers[13] <= 90 or not -180 <= numbers[14] <= 180):
            return None
        if f[8] == 'lost':
            return None
        transport = [name for bit,name in ((1,'Wi-Fi beacon'),(2,'Wi-Fi NAN'),(4,'BLE'),(8,'extended BLE')) if numbers[3] & bit]
        result = {'type':'receiver-rid','protocol':'marauder-rid','received_at':now,
                  'display_id':f[1],'uptime_ms':numbers[0],'packet_count':numbers[6],
                  'packet_rate_hz':numbers[7],'channel':numbers[4],'rssi_dbm':numbers[5],
                  'transports':', '.join(transport),'local_only':True}
        # No location-valid flag, broadcast time, or ID type exists in this CSV version.
        # Keep coordinates separate from the Engine's position and upload fields.
        if numbers[13] or numbers[14]:
            result.update(reported_latitude=numbers[13], reported_longitude=numbers[14])
        return result
    except (ValueError, UnicodeError, csv.Error, OverflowError):
        return None


def decode_line(line, format, now):
    if len(line) > 4096:
        return None
    if format == 'marauder':
        return marauder(line, now)
    if format == 'remoteid-json':
        from .radios import mqtt_envelope
        event = mqtt_envelope(line, now)
        if event and messages(event['payload'], event['received_at']):
            return event
    return None


def receive(port, baud, format, stop, emit, status):
    try:
        import serial
    except ImportError:
        raise RuntimeError('Install the serial extra: pip install "./linux-node[serial]"') from None
    if not valid_port(port) or not port or baud not in BAUDS or format not in FORMATS:
        raise ValueError('Choose a local serial port, baud rate and receiver format')
    if port not in {p['port'] for p in ports()}:
        raise ValueError('Serial receiver is not attached; refresh ports and reconnect it')
    connection = serial.Serial(port=None, baudrate=baud, timeout=.25, write_timeout=.25)
    connection.dtr = False
    connection.rts = False
    if __import__('os').name != 'nt':
        connection.exclusive = True
    connection.port = port
    parser = Lines()
    accepted = ignored = 0
    recent = {}
    try:
        connection.open()
        connection.reset_input_buffer()
        status('Connected · start Remote ID scan on the receiver')
        last_status = time.monotonic()
        while not stop.is_set():
            chunk = connection.read(min(max(connection.in_waiting, 1), 4096))
            for line in parser.feed(chunk):
                now = time.time()
                event = decode_line(line, format, now)
                if event and event['type'] == 'receiver-rid':
                    key = event['display_id']
                    fingerprint = (event['uptime_ms'], event['packet_count'])
                    previous = recent.get(key)
                    if previous and (fingerprint[1] == previous[0][1] or fingerprint == previous[0]):
                        event = None
                    else:
                        recent[key] = (fingerprint, now)
                        recent = dict(sorted(recent.items(), key=lambda p:p[1][1], reverse=True)[:200])
                if event:
                    accepted += 1
                    event['source'] = 'serial:' + port
                    emit(event)
                elif line:
                    ignored += 1
            if time.monotonic() - last_status >= 1:
                status(f'Connected · {accepted} reports · {ignored + parser.rejected} ignored lines · {format}')
                last_status = time.monotonic()
    finally:
        connection.close()
