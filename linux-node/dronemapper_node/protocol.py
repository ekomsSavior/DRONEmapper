"""Receive-only ASTM F3411 protocol v2 parsing. AGPL-3.0-or-later.

Wire-layout references: OpenDroneID core C opendroneid.h and wifi.c.
Only Basic ID and aircraft Location are retained; operator fields are ignored.
"""
import csv
import math
import re
import struct

AIRFRAMES = ['Unknown airframe', 'Aeroplane', 'Helicopter / multirotor', 'Gyroplane',
             'Hybrid lift', 'Ornithopter', 'Glider', 'Kite', 'Free balloon',
             'Captive balloon', 'Airship', 'Free-fall parachute', 'Rocket',
             'Tethered powered aircraft', 'Ground obstacle', 'Other']
MAC = re.compile(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}')


def finite(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def messages(payload, received):
    if not payload or payload[0] & 15 != 2:
        return []
    if payload[0] >> 4 == 15:
        if len(payload) < 3 or payload[1] != 25 or not 1 <= payload[2] <= 9:
            return []
        if len(payload) != 3 + 25 * payload[2]:
            return []
        parts = [payload[p:p+25] for p in range(3, len(payload), 25)]
        if any(b[0] & 15 != 2 or b[0] >> 4 == 15 for b in parts):
            return []
    elif len(payload) == 25:
        parts = [payload]
    else:
        return []
    out = []
    for b in parts:
        kind = b[0] >> 4
        if kind == 0:
            if not 1 <= b[1] >> 4 <= 4 or not any(b[2:22]):
                continue
            raw = b[2:22]
            display = ''.join(chr(c) if 32 <= c <= 126 else '?' for c in raw.rstrip(b'\0'))
            out.append({'type': 'id', 'rid': raw.hex(), 'id_type': b[1] >> 4,
                        'aircraft_type': b[1] & 15, 'display_id': display})
        elif kind == 1:
            lat, lon = (v / 1e7 for v in struct.unpack_from('<ii', b, 5))
            stamp = struct.unpack_from('<H', b, 21)[0]
            if not -90 <= lat <= 90 or not -180 <= lon <= 180 or (lat, lon) == (0, 0) or stamp > 36000:
                continue
            hour = math.floor(received / 3600) * 3600
            observed = min((hour + stamp / 10 + d for d in (-3600, 0, 3600)), key=lambda t: abs(t-received))
            if not received - 120 <= observed <= received + 5:
                continue
            loc = {'type': 'location', 'latitude': lat, 'longitude': lon, 'observed_at': observed}
            alt = struct.unpack_from('<H', b, 15)[0]
            speed = b[3] * (.75 if b[1] & 1 else .25) + (63.75 if b[1] & 1 else 0)
            if alt:
                loc['altitude_m'] = alt / 2 - 1000
            if speed < 255:
                loc['speed_mps'] = speed
            if b[2] < 180:
                loc['heading'] = b[2] + (180 if b[1] & 2 else 0)
            out.append(loc)
    return out


def camera_signature(name):
    if re.fullmatch(r'WIFI_(?:[248]K|CAM|FPV)[_-]+[A-Z0-9_-]{3,32}', name, re.I):
        return 'wifi-cam-name'
    if re.fullmatch(r'TELLO-[A-Z0-9]{6}', name):
        return 'tello-name'
    return None


def radiotap(packet):
    """Return raw 802.11 plus optional frequency/RSSI. Reject bad/truncated headers."""
    if len(packet) < 8 or packet[0] != 0:
        return None
    length = struct.unpack_from('<H', packet, 2)[0]
    if not 8 <= length <= len(packet):
        return None
    present = struct.unpack_from('<I', packet, 4)[0]
    p, mask = 8, present
    while mask & 0x80000000:
        if p + 4 > length or p > 128:
            return None
        mask = struct.unpack_from('<I', packet, p)[0]
        p += 4
    meta, flags = {}, 0
    for bit, (alignment, size) in enumerate([(8,8), (1,1), (1,1), (2,4), (2,2), (1,1)]):
        if present & (1 << bit):
            p = (p + alignment - 1) // alignment * alignment
            if p + size > length:
                return None
            if bit == 1:
                flags = packet[p]
            elif bit == 3:
                meta['frequency_mhz'] = struct.unpack_from('<H', packet, p)[0]
            elif bit == 5:
                meta['rssi_dbm'] = struct.unpack_from('b', packet, p)[0]
            p += size
    if flags & 0x40:
        return None
    frame = packet[length:]
    if flags & 0x10:
        if len(frame) < 4:
            return None
        frame = frame[:-4]
    return frame, meta


def wifi_frame(frame):
    """Strict beacon and NAN publish parsing; unrelated traffic is dropped."""
    if len(frame) < 24 or frame[1] & 0x44 or frame[22] & 15 or frame[0] not in (0x80, 0xd0):
        return []
    sender = ':'.join(f'{b:02X}' for b in frame[10:16])
    if frame[10] & 1 or not any(frame[10:16]):
        return []
    results = []
    if frame[0] == 0x80:
        if len(frame) < 36:
            return []
        p, name = 36, None
        while p < len(frame):
            if p + 2 > len(frame):
                return []
            kind, size = frame[p:p+2]
            p += 2
            if p + size > len(frame):
                return []
            value = frame[p:p+size]
            p += size
            if kind == 0:
                if size > 32 or name is not None:
                    return []
                name = value.decode('utf-8', errors='replace')
            if kind == 221 and len(value) >= 30 and value[:4] == b'\xfa\x0b\xbc\x0d':
                results.append({'mac': sender, 'protocol': 'wifi-beacon', 'payload': value[5:]})
        if name and camera_signature(name):
            results.append({'mac': sender, 'name': name, 'signature': camera_signature(name)})
    elif frame[4:10] == b'\x51\x6f\x9a\x01\0\0' and frame[24:30] == b'\x04\x09\x50\x6f\x9a\x13':
        p = 30
        while p < len(frame):
            if p + 3 > len(frame):
                return []
            kind, size = frame[p], struct.unpack_from('<H', frame, p+1)[0]
            p += 3
            if p + size > len(frame):
                return []
            value = frame[p:p+size]
            p += size
            if kind == 3 and len(value) >= 10 and value[:6] == b'\x88\x69\x19\x9d\x92\x09' and value[8] == 0x10:
                if value[9] != size - 10:
                    return []
                results.append({'mac': sender, 'protocol': 'wifi-aware', 'payload': value[11:]})
    return results


class PcapStream:
    """Bounded incremental classic-pcap reader for dumpcap -P -w -. No packet files."""
    def __init__(self):
        self.buffer = bytearray()
        self.endian = None
        self.linktype = None
        self.scale = 1e6

    def feed(self, data):
        self.buffer.extend(data)
        if len(self.buffer) > 2 * 1024 * 1024:
            raise ValueError('Capture stream exceeded its size limit')
        if self.endian is None:
            if len(self.buffer) < 24:
                return []
            types = {b'\xd4\xc3\xb2\xa1': ('<', 1e6), b'\xa1\xb2\xc3\xd4': ('>', 1e6),
                     b'\x4d\x3c\xb2\xa1': ('<', 1e9), b'\xa1\xb2\x3c\x4d': ('>', 1e9)}
            if bytes(self.buffer[:4]) not in types:
                raise ValueError('Expected classic pcap; use dumpcap -P')
            self.endian, self.scale = types[bytes(self.buffer[:4])]
            version = struct.unpack_from(self.endian+'HH', self.buffer, 4)
            self.linktype = struct.unpack_from(self.endian+'I', self.buffer, 20)[0]
            if version != (2,4) or self.linktype not in (105,127):
                raise ValueError('Capture must contain raw 802.11 or radiotap; configure a monitor interface')
            del self.buffer[:24]
        result = []
        while len(self.buffer) >= 16:
            sec, frac, size, original = struct.unpack_from(self.endian+'IIII', self.buffer)
            if size > 65535 or size > original or frac >= self.scale:
                raise ValueError('Invalid pcap packet length or timestamp')
            if len(self.buffer) < size + 16:
                break
            result.append((sec + frac/self.scale, bytes(self.buffer[16:16+size]), self.linktype))
            del self.buffer[:16+size]
        return result


def spectrum_row(line):
    """Parse hackrf_sweep / rtl_power CSV into bounded, unclassified power bins."""
    if len(line) > 65536:
        return []
    try:
        fields = next(csv.reader([line]))
        lo, hi, step = map(float, fields[2:5])
        values = [float(x) for x in fields[6:]]
        if not values or len(values) > 4096 or not all(math.isfinite(x) for x in [lo,hi,step]):
            return []
        if not 0 < lo < hi <= 6e9 or step <= 0 or step * len(values) > (hi-lo)*1.05:
            return []
        return [{'frequency_mhz': (lo+(i+.5)*step)/1e6, 'power_db': v}
                for i,v in enumerate(values) if math.isfinite(v) and -200 <= v <= 100]
    except (ValueError, IndexError, StopIteration):
        return []


def bearing_distance(origin, target):
    lat1, lon1, lat2, lon2 = map(math.radians, [*origin, *target])
    dlat, dlon = lat2-lat1, lon2-lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    distance = 6371000 * 2 * math.asin(math.sqrt(min(1, max(0,a))))
    bearing = math.degrees(math.atan2(math.sin(dlon)*math.cos(lat2), math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(dlon))) % 360
    return bearing, distance
