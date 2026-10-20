"""Validated ADS-B records and receive-only DJI DroneID IQ decoding.

Decoded/replayed data never enters the Remote ID transport implicitly.
Church of Malware / saviorSEC, AGPL-3.0-or-later.
"""
import contextlib
import json
import math
import os
from pathlib import Path
import re
import stat
import struct
import time
from .protocol import finite
from .platform_support import regular_fd

MAX_JSON = 4 * 1024 * 1024


def read_json(path, limit=MAX_JSON):
    # Nonblocking open and regular-file validation avoid FIFOs/devices hanging a receiver.
    fd = regular_fd(path)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError('Decoder input must be a bounded regular JSON file')
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Decoder input exceeds size limit')
    return json.loads(data)


def adsb_records(document, now):
    """Read readsb aircraft.json; only direct ADS-B, fresh explicit positions.

    dbFlags/military/callsign/autopilot are deliberately not autonomy evidence.
    B6 is the transmitter's UAS category, not authenticated manufacturer identity.
    """
    if not isinstance(document, dict) or not finite(document.get('now'), now-15, now+5):
        return []
    rows = document.get('aircraft')
    if not isinstance(rows, list) or len(rows) > 10000:
        return []
    stamp = document['now']
    result = []
    for row in rows:
        if not isinstance(row, dict) or row.get('type') != 'adsb_icao':
            continue
        address = row.get('hex')
        if not isinstance(address, str) or not re.fullmatch('[0-9a-fA-F]{6}', address) or address.lower() in ('000000','ffffff'):
            continue
        age, pos_age = row.get('seen'), row.get('seen_pos')
        if not finite(age, 0, 60) or not finite(pos_age, 0, 60):
            continue
        if not isinstance(row.get('mlat',[]),list) or not isinstance(row.get('tisb',[]),list):
            continue
        if any(k in row.get('mlat', []) or k in row.get('tisb', []) for k in ('lat','lon')):
            continue
        lat, lon = row.get('lat'), row.get('lon')
        if not finite(lat,-90,90) or not finite(lon,-180,180) or (lat == 0 and lon == 0):
            continue
        unmanned = row.get('category') == 'B6'
        event = {'type':'decoded','protocol':'adsb','source':'sdr:adsb',
            'device_id':address.upper(), 'received_at':stamp-age, 'observed_at':stamp-pos_age,
            'latitude':lat, 'longitude':lon, 'unmanned':unmanned,
            'name':'Unmanned aircraft · ADS-B' if unmanned else 'Aircraft · autonomy unknown',
            'identification':'Broadcast UAS category B6; identity unverified' if unmanned else 'ADS-B aircraft; autonomy unknown',
            'frequency_mhz':1090, 'verification':'readsb-decoded'}
        for key, target, lo, hi, factor in [('alt_geom','altitude_m',-2000,100000,.3048),('gs','speed_mps',0,2000,.514444444),('track','heading',0,359.999,1),('rssi','rssi_dbfs',-100,0,1)]:
            if finite(row.get(key),lo,hi):
                event[target] = round(row[key]*factor,3)
        if 'altitude_m' in event:
            event['altitude_reference'] = 'WGS84 ellipsoid (ADS-B)'
        if isinstance(row.get('flight'),str) and re.fullmatch(r'[A-Z0-9 -]{1,8}',row['flight']):
            event['callsign'] = row['flight'].strip()
        result.append(event)
    return result


# Factual model codes from DroneSecurity/droneid_packet.py (revision in vendor NOTICE).
DJI_MODELS = {16:'Mavic Pro',24:'Mavic Air',41:'Mavic 2',53:'Mavic Mini',58:'Mavic Air 2',
              60:'M300 RTK',61:'DJI FPV',63:'Mini 2',64:'AGRAS T10',65:'AGRAS T30',
              66:'Air 2S',67:'M30',68:'Mavic 3',69:'Mavic 2 Enterprise Advanced',70:'Mini SE'}


def dji_payload(raw):
    """Check packet CRC before extracting only aircraft fields. No pilot/home data."""
    if not isinstance(raw,bytes) or len(raw)<91 or raw[:3] != bytes([88,16,2]):
        return None
    crc = 0x3692
    for byte in raw[:89]:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0x8408 if crc & 1 else 0)
    if crc != int.from_bytes(raw[89:91],'little'):
        return None
    serial_bytes = raw[7:23]
    serial = serial_bytes.rstrip(b'\0')
    serial = serial.decode('ascii') if serial and all(33<=c<=126 for c in serial) else None
    # Offsets intentionally skip every operator/home field.
    lon,lat = struct.unpack_from('<ii',raw,23)
    lat,lon = lat/174533.0,lon/174533.0
    stamp = struct.unpack_from('<Q',raw,43)[0]/1000
    code = raw[67]
    record = {'protocol':'dji-droneid','device_id':serial,
              'manufacturer':'DJI','model':DJI_MODELS.get(code),'model_code':code,
              'verification':'crc-valid','unmanned':True,
              'identification':'Decoded DJI DroneID; broadcast identity unverified',
              'name':'Drone · '+DJI_MODELS.get(code,'DJI model unknown')}
    if finite(stamp,1,4102444800):
        record['observed_at'] = stamp
    if finite(lat,-90,90) and finite(lon,-180,180) and lat != 0 and lon != 0:
        record.update(latitude=lat,longitude=lon)
    # Upstream altitude/velocity scaling and state validity remain under review.
    # Omit them rather than attaching a misleading datum or unit.
    return record


def decode_dji_file(path, sample_rate, sample_format='cf32', skip_detection=False, *, max_candidates=4096, deadline=None):
    """Offline bounded IQ demodulation. Returns a review report, never a live event."""
    if not finite(sample_rate,15360000,50000000) or sample_format not in ('cf32','cs8'):
        raise ValueError('DJI decoding needs 15.36–50 Msps and cf32 or cs8 IQ')
    try:
        import numpy as np
        import matplotlib
        matplotlib.use('Agg')
        from ._vendor.dronesecurity.SpectrumCapture import SpectrumCapture
        from ._vendor.dronesecurity.Packet import Packet
        from ._vendor.dronesecurity.qpsk import Decoder
    except ImportError as error:
        raise ValueError('Install the DJI extra: pip install "./linux-node[dji]"') from error
    fd=regular_fd(path)
    with os.fdopen(fd,'rb') as stream, open(os.devnull,'w') as quiet:
        info=os.fstat(stream.fileno()); width=8 if sample_format=='cf32' else 2
        if not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=512*1024*1024 or info.st_size%width:
            raise ValueError('IQ must be a regular file, whole samples, at most 512 MiB')
        chunk_samples=int(sample_rate*.5)
        if skip_detection and info.st_size/width > sample_rate*.02:
            raise ValueError('Skip detection is only for an isolated burst of at most 20 ms')
        report={'schema_version':1,'mode':'recorded-review','protocol':'dji-droneid',
                'sample_rate':sample_rate,'sample_format':sample_format,
                'candidates':0,'decoded_packets':0,'rejected_candidates':0,'processing_limited':False,'detections':[]}
        prior=np.empty(0,dtype=np.complex64); unique=set()
        while True:
            if deadline is not None and time.monotonic()>deadline:
                report['processing_limited']=True
                break
            data=stream.read(chunk_samples*width)
            if not data: break
            samples=(np.frombuffer(data,dtype='<c8').copy() if sample_format=='cf32'
                     else np.frombuffer(data,dtype=np.int8).astype(np.float32).view(np.complex64)/128)
            samples=np.concatenate((prior,samples))
            prior=samples[-int(sample_rate*.002):].copy()
            if len(samples)<1024 or not np.isfinite(samples).all() or not np.any(samples):
                continue
            with contextlib.redirect_stdout(quiet),contextlib.redirect_stderr(quiet):
                capture=SpectrumCapture(samples,Fs=sample_rate,skip_detection=skip_detection,debug=False)
                report['candidates']+=len(capture.packets)
                for index in range(len(capture.packets)):
                    if report['decoded_packets']+report['rejected_candidates']>=max_candidates or deadline is not None and time.monotonic()>deadline:
                        report['processing_limited']=True
                        break
                    valid=None
                    try:
                        packet=Packet(capture.get_packet_samples(index),debug=False,enable_zc_detection=True)
                        decoder=Decoder(packet.get_symbol_data(skip_zc=True))
                        for phase in range(4):
                            decoder.raw_data_to_symbol_bits(phase)
                            valid=dji_payload(decoder.magic())
                            if valid: break
                    except (ValueError,IndexError,TypeError,ZeroDivisionError,FloatingPointError):
                        pass
                    if valid:
                        report['decoded_packets']+=1
                        key=json.dumps(valid,sort_keys=True)
                        if key not in unique:
                            unique.add(key);report['detections'].append(valid)
                    else:
                        report['rejected_candidates']+=1
            if report['processing_limited']: break
    return report


def live_dji_records(report, captured_at, now, frequency_mhz):
    """Called only by the owned capture worker. Offline CLI has no live-output option."""
    if not finite(captured_at,now-60,now+1):
        return []
    result=[]
    for row in report.get('detections',[]):
        # Identified fresh aircraft only. Never substitute phone/home GPS or receipt time.
        if not row.get('device_id') or row.get('verification')!='crc-valid' or not finite(row.get('observed_at'),captured_at-5,captured_at+5):
            continue
        if not finite(row.get('latitude'),-90,90) or not finite(row.get('longitude'),-180,180):
            continue
        result.append({**row,'type':'decoded','source':'sdr:dji-droneid',
                       'received_at':captured_at,'frequency_mhz':frequency_mhz})
    return result
