"""Desktop receive backends. No SDR transmit or arbitrary shell commands. AGPL-3.0-or-later."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import time
import sys
import tempfile
import threading
import uuid
from .robot_signals import robot_signature, CYBERDOG_UUID
from .decoders import adsb_records, read_json
from .protocol import PcapStream, radiotap, wifi_frame, spectrum_row, finite, MAC
from .storage import BANDS
from .platform_support import system, tool_path, is_link, valid_interface
from .processes import process_bytes

WIFI_FILTER='wlan[0] == 0x80 or wlan[0] == 0x50 or wlan[0] == 0xd0'


def installed_path(tool):
    return next((str(Path(directory)/tool) for directory in os.get_exec_path()
                 if (Path(directory)/tool).is_file()),None)


def doctor():
    interfaces=[]
    if system() == 'Linux' and tool_path('iw'):
        try:
            result=subprocess.run([tool_path('iw'),'dev'],capture_output=True,text=True,timeout=5)
            # Do not include SSIDs, interface addresses or hardware serials.
            for block in result.stdout.split('Interface ')[1:]:
                name=block.splitlines()[0].strip()
                kind=re.search(r'\btype (\S+)',block)
                channel=re.search(r'\bchannel (\d+)',block)
                interfaces.append({'name':name,'mode':kind.group(1) if kind else 'unknown',
                                   'channel':int(channel.group(1)) if channel else None})
        except (OSError,subprocess.SubprocessError):
            pass
    if system() != 'Linux' and tool_path('dumpcap'):
        try:
            result = subprocess.run([tool_path('dumpcap'), '-D'], capture_output=True, text=True, timeout=5)
            for line in result.stdout.splitlines():
                match = re.match(r'^\d+\. (\S+)', line)
                if match and valid_interface(match.group(1)):
                    interfaces.append({'name':match.group(1), 'mode':'monitor capability needs checking', 'channel':None})
        except (OSError, subprocess.SubprocessError):
            pass
    from .serial_receiver import ports
    from .network_receiver import interfaces as lan_interfaces
    return {'lan_interfaces':lan_interfaces(), 'serial_ports':ports(), 'pyserial':importlib.util.find_spec('serial') is not None, 'platform':system(),'wifi':interfaces,'bluetooth':([p.name for p in Path('/sys/class/bluetooth').glob('hci*')] if system() == 'Linux' else ['default']),
            'tools':{tool:bool(tool_path(tool)) for tool in ('iw','dumpcap','hackrf_sweep','hackrf_transfer','rtl_power','readsb')},
            'tool_access':{tool:'Installed but execution is unavailable; check user/group access'
                           for tool in ('iw','dumpcap','hackrf_sweep','hackrf_transfer','rtl_power','readsb') if installed_path(tool) and not tool_path(tool)},
            'dji_decoder':all(importlib.util.find_spec(x) is not None for x in ('numpy','scipy','matplotlib','bitarray')),
            'bleak':importlib.util.find_spec('bleak') is not None,
            'paho_mqtt':importlib.util.find_spec('paho') is not None}


def wifi(interface,stop,emit,status):
    if not tool_path('dumpcap'):
        if installed_path('dumpcap'):
            raise RuntimeError('dumpcap is installed but cannot execute as this user; activate the wireshark group or check sandbox capture permissions')
        raise RuntimeError('Install Wireshark / dumpcap and configure capture access; see the desktop node guide')
    matching=[x for x in doctor()['wifi'] if x['name']==interface]
    if not matching:
        raise RuntimeError('Choose an attached local capture interface from Receiver status')
    extra=[]
    if system() == 'Linux':
        if matching[0]['mode']!='monitor':
            raise RuntimeError(f'{interface} is not a monitor interface. Use a dedicated adapter; see Wi-Fi setup')
    else:
        # Requested explicitly by the user; do not switch adapters during discovery.
        check=subprocess.run([tool_path('dumpcap'),'-i',interface,'-I','-L'],capture_output=True,text=True,timeout=8)
        if check.returncode or not re.search(r'\bIEEE802_11(?:_RADIO)?\b',check.stdout):
            raise RuntimeError('This adapter / driver does not expose monitor-mode 802.11 capture')
        link='IEEE802_11_RADIO' if 'IEEE802_11_RADIO' in check.stdout else 'IEEE802_11'
        extra=['-I','-y',link]
    parser=PcapStream()
    status('Listening · monitor mode · starting channel '+str(matching[0]['channel'] or 'driver-selected'))
    command=[tool_path('dumpcap'),'-i',interface,*extra,'-P','-s','4096','-f',WIFI_FILTER,'-q','-w','-']
    for chunk in process_bytes(command,stop):
        for stamp,packet,linktype in parser.feed(chunk):
            now=time.time()
            if not now-120 <= stamp <= now+5:
                continue
            decoded=radiotap(packet) if linktype==127 else (packet,{})
            if decoded is None:
                continue
            frame,meta=decoded
            emit({'type':'frame','source':'wifi:'+interface})
            for item in wifi_frame(frame):
                emit({**item,**meta,'type':'vendor' if item.get('vendor_only') else 'candidate' if 'signature' in item else 'rid','source':'wifi:'+interface,'received_at':stamp})


def ble_identity(address):
    identity={}
    if MAC.fullmatch(address):
        identity['mac']=address.upper()
    elif system()=='Darwin':
        try:
            identity['receiver_id']=str(uuid.UUID(address))
        except (ValueError, TypeError):
            return None
    else:
        return None
    return identity


def ble_event(address, data, rssi, adapter):
    identity=ble_identity(address)
    if not identity or not data or len(data)<27 or data[0]!=13:
        return None
    return {'type':'rid','source':'ble:'+adapter,**identity,'payload':bytes(data[2:]),
            'protocol':'ble','received_at':time.time(),'rssi_dbm':rssi}


def ble_options(adapter):
    if system()=='Linux':
        if adapter=='default':
            adapter='hci0'
        return {'scanning_mode':'passive','bluez':{'adapter':adapter,'or_patterns':[(0,0x16,b'\xfa\xff'),(0,0x02,b'\x20\xc4'),(0,0x03,b'\x20\xc4'),(0,0x09,'铁蛋'.encode())]}}
    if adapter!='default':
        raise ValueError('Choose System Bluetooth on Windows / macOS')
    if system()=='Darwin':
        # CoreBluetooth has no passive mode and exposes per-host UUIDs, not radio MACs.
        return {'scanning_mode':'active','service_uuids':['0000fffa-0000-1000-8000-00805f9b34fb',CYBERDOG_UUID]}
    return {'scanning_mode':'passive'}


def ble(adapter,stop,emit,status):
    try:
        from bleak import BleakScanner
    except ImportError:
        raise RuntimeError('Install the BLE extra: pip install "./linux-node[ble]"') from None
    def found(device,advertisement):
        data=advertisement.service_data.get('0000fffa-0000-1000-8000-00805f9b34fb')
        event=ble_event(device.address,data,advertisement.rssi,adapter)
        if event:
            emit(event)
        signature = robot_signature(advertisement.local_name, advertisement.service_uuids,
                                    advertisement.manufacturer_data)
        if signature:
            # Reuse platform address handling without interpreting this as Remote ID.
            identity = ble_identity(device.address)
            if identity:
                emit({**identity,'type':'robot-candidate','source':'ble:'+adapter,
                      'received_at':time.time(),'rssi_dbm':advertisement.rssi,'name':advertisement.local_name,
                      'signature':signature})
    async def listen():
        scanner=BleakScanner(found,**ble_options(adapter))
        async with scanner:
            status('Listening · Remote ID / robot advertisements · '+('CoreBluetooth discovery' if system()=='Darwin' else 'passive Bluetooth advertisements'))
            while not stop.is_set():
                await asyncio.sleep(.25)
    asyncio.run(listen())


def sdr(kind,band,stop,emit,status):
    low,high=BANDS[band]
    if kind=='hackrf':
        command=['hackrf_sweep','-f',f'{low}:{high}','-w','100000','-a','0','-p','0','-l','16','-g','20']
    elif kind=='rtl' and high<=1766:
        command=['rtl_power','-f',f'{low}M:{high}M:100k','-i','2','-']
    else:
        raise RuntimeError('Unsupported SDR frequency range')
    if not tool_path(command[0]):
        raise RuntimeError('Install '+('hackrf' if kind=='hackrf' else 'rtl-sdr')+' receive tools; see the desktop setup guide')
    command[0]=tool_path(command[0])
    status(f'Listening · {low}–{high} MHz · unclassified RF power')
    pending=bytearray()
    for chunk in process_bytes(command,stop):
        pending.extend(chunk)
        if len(pending)>262144:
            raise ValueError('Spectrum output exceeded buffer limit')
        while b'\n' in pending:
            line,_,rest=pending.partition(b'\n')
            pending=bytearray(rest)
            bins=spectrum_row(line.decode('ascii',errors='replace'))
            if bins:
                emit({'type':'spectrum','source':kind,'bins':bins,'received_at':time.time()})


def mqtt_envelope(data,now,retained=False):
    if retained or len(data)>4096:
        return None
    try:
        r=json.loads(data)
        required={'schema_version','protocol','mac','payload_hex','received_at'}
        if not isinstance(r,dict) or not required<=r.keys() or r.keys()-required-{'rssi_dbm'} or type(r['schema_version']) is not int or r['schema_version']!=1:
            return None
        if r['protocol'] not in ('ble','wifi-beacon','wifi-aware') or not isinstance(r['mac'],str) or not MAC.fullmatch(r['mac']) or not finite(r['received_at'],now-120,now+5):
            return None
        raw=bytes.fromhex(r['mac'].replace(':',''))
        if raw[0]&1 or not any(raw):
            return None
        if not isinstance(r['payload_hex'],str) or not re.fullmatch(r'[0-9a-fA-F]{50,456}',r['payload_hex']):
            return None
        event={'type':'rid','source':'mqtt','protocol':r['protocol'],'mac':r['mac'].upper(),
               'payload':bytes.fromhex(r['payload_hex']),'received_at':r['received_at']}
        if 'rssi_dbm' in r and finite(r['rssi_dbm'],-127,20):
            event['rssi_dbm']=r['rssi_dbm']
        return event
    except (ValueError,TypeError):
        return None


def mqtt(path,stop,emit,status):
    try:
        import paho.mqtt.client as mqtt_client
    except ImportError:
        raise RuntimeError('Install the MQTT extra: pip install "./linux-node[mqtt]"') from None
    file=Path(path).expanduser()
    if is_link(file) or system() != 'Windows' and (file.stat().st_mode & 0o077 or file.stat().st_uid!=os.getuid()):
        raise ValueError('MQTT configuration must be owned by your user with permissions 600')
    if file.stat().st_size>8192:
        raise ValueError('MQTT configuration is too large')
    config=json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(config,dict) or set(config)-{'host','topic','tls','port','ca_file','username','password_env'}:
        raise ValueError('Invalid MQTT configuration fields')
    host,topic=config.get('host'),config.get('topic')
    if not isinstance(host,str) or not re.fullmatch(r'[A-Za-z0-9.:-]{1,253}',host) or not isinstance(topic,str) or not 1<=len(topic)<=256 or any(c in topic for c in ('#','+','\0')):
        raise ValueError('MQTT needs a broker hostname and one exact topic; wildcards are not accepted')
    tls=config.get('tls',True)
    if type(tls) is not bool:
        raise ValueError('MQTT tls must be true or false')
    if not tls and host not in ('localhost','127.0.0.1','::1'):
        raise ValueError('Remote MQTT brokers require TLS')
    port=config.get('port',8883 if tls else 1883)
    if type(port) is not int or not 1<=port<=65535:
        raise ValueError('Invalid MQTT port')
    client=mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2,clean_session=True)
    if tls:
        client.tls_set_context(ssl.create_default_context(cafile=config.get('ca_file')))
    if config.get('username'):
        password=os.environ.get(config.get('password_env',''))
        if config.get('password_env') and password is None:
            raise ValueError('MQTT password environment variable is not set')
        client.username_pw_set(config['username'],password)
    def connected(client,userdata,flags,reason,properties):
        if reason==0:
            client.subscribe(topic,qos=1)
            status('Connected · receiving the configured Remote ID topic')
        else:
            status('Broker refused connection; check credentials and topic access')
    def message(client,userdata,msg):
        if msg.topic==topic:
            event=mqtt_envelope(msg.payload,time.time(),msg.retain)
            if event:
                emit(event)
    def disconnected(client,userdata,flags,reason,properties):
        if not stop.is_set():
            status('Broker disconnected · reconnecting')
    client.on_connect=connected
    client.on_message=message
    client.on_disconnect=disconnected
    client.reconnect_delay_set(min_delay=2,max_delay=60)
    client.connect_async(host,port,keepalive=60)
    client.loop_start()
    try:
        status('Connecting to configured MQTT broker')
        while not stop.wait(.5):
            pass
    finally:
        client.disconnect()
        client.loop_stop()


def readsb_feed(path,stop,emit,status):
    last={}
    while not stop.is_set():
        try:
            doc=read_json(path)
            records=adsb_records(doc,time.time())
            for record in records:
                key=record['device_id']; stamp=(record['received_at'],record['observed_at'])
                if last.get(key)!=stamp:
                    emit(record); last[key]=stamp
            last={k:v for k,v in last.items() if time.time()-v[0]<120}
            fresh=isinstance(doc,dict) and finite(doc.get('now'),time.time()-15,time.time()+5)
            status((f'Decoding ADS-B · {int(doc.get("messages",0)) if finite(doc.get("messages"),0,1e15) else 0} messages · {len(records)} fresh aircraft · '+str(sum(r['unmanned'] for r in records))+' reporting UAS category') if fresh else 'Waiting for fresh readsb data')
        except (FileNotFoundError,json.JSONDecodeError):
            status('Waiting for readsb aircraft.json')
        if stop.wait(1): break


def adsb(kind,stop,emit,status):
    if not tool_path('readsb'):
        raise RuntimeError('Install readsb with '+kind+' support; see decoder setup')
    # No network ports or external feeds. This process owns exactly one SDR.
    with tempfile.TemporaryDirectory(prefix='dronemapper-readsb-') as directory:
        command=[tool_path('readsb'),'--device-type','hackrf' if kind=='hackrf' else 'rtlsdr',
                 '--no-fix','--no-fix-df','--write-json',directory,'--write-json-every','1','--quiet']
        if kind=='hackrf': command+=['--gain','16','--hackrf-vgagain','20']
        local_stop=threading.Event()
        failure=[]
        def capture():
            try:
                for _ in process_bytes(command,local_stop): pass
            except Exception as error:
                failure.append(error)
            finally:
                local_stop.set()
        child=threading.Thread(target=capture,daemon=True);child.start()
        # Relay parent shutdown while the reader waits on its own stop event.
        def relay():
            while not local_stop.wait(.2):
                if stop.is_set(): local_stop.set()
        relay_thread=threading.Thread(target=relay,daemon=True);relay_thread.start()
        try:
            readsb_feed(Path(directory)/'aircraft.json',local_stop,emit,status)
        finally:
            local_stop.set();child.join(timeout=5);relay_thread.join(timeout=1)
        if failure and not stop.is_set(): raise failure[0]


def dji(frequency,stop,emit,status):
    status(f'DJI DroneID · {frequency:g} MHz · capturing / decoding bursts; reception gaps during processing')
    command=[sys.executable,str(Path(__file__).with_name('dji_worker.py')),'--frequency',str(frequency)]
    pending=bytearray()
    for chunk in process_bytes(command,stop):
        pending.extend(chunk)
        if len(pending)>65536: raise ValueError('DJI decoder output exceeded limit')
        while b'\n' in pending:
            line,_,rest=pending.partition(b'\n');pending=bytearray(rest)
            record=json.loads(line)
            if 'worker_status' in record: status(str(record['worker_status'])[:240])
            elif record.get('type')=='decoded' and record.get('protocol')=='dji-droneid':emit(record)
