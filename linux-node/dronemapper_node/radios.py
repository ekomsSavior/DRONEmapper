"""Linux receive backends. No RF transmission or arbitrary shell commands. AGPL-3.0-or-later."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import ssl
import subprocess
import time
from .protocol import PcapStream, radiotap, wifi_frame, spectrum_row, finite, MAC
from .storage import BANDS

WIFI_FILTER='wlan[0] == 0x80 or wlan[0] == 0xd0'


def installed_path(tool):
    return next((str(Path(directory)/tool) for directory in os.get_exec_path()
                 if (Path(directory)/tool).is_file()),None)


def doctor():
    interfaces=[]
    if shutil.which('iw'):
        try:
            result=subprocess.run(['iw','dev'],capture_output=True,text=True,timeout=5)
            # Do not include SSIDs, interface addresses or hardware serials.
            for block in result.stdout.split('Interface ')[1:]:
                name=block.splitlines()[0].strip()
                kind=re.search(r'\btype (\S+)',block)
                channel=re.search(r'\bchannel (\d+)',block)
                interfaces.append({'name':name,'mode':kind.group(1) if kind else 'unknown',
                                   'channel':int(channel.group(1)) if channel else None})
        except (OSError,subprocess.SubprocessError):
            pass
    return {'wifi':interfaces,'bluetooth':[p.name for p in Path('/sys/class/bluetooth').glob('hci*')],
            'tools':{tool:bool(shutil.which(tool)) for tool in ('iw','dumpcap','hackrf_sweep','rtl_power')},
            'tool_access':{tool:'Installed but execution is unavailable; check user/group access'
                           for tool in ('iw','dumpcap','hackrf_sweep','rtl_power') if installed_path(tool) and not shutil.which(tool)},
            'bleak':importlib.util.find_spec('bleak') is not None,
            'paho_mqtt':importlib.util.find_spec('paho') is not None}


def process_bytes(command,stop):
    """Stream stdout, bound stderr, and terminate owned children on every exit path."""
    child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    errors=bytearray()
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout,selectors.EVENT_READ,'out')
            selector.register(child.stderr,selectors.EVENT_READ,'err')
            while selector.get_map() and not stop.is_set():
                for key,_ in selector.select(.3):
                    data=os.read(key.fileobj.fileno(),65536)
                    if not data:
                        selector.unregister(key.fileobj)
                    elif key.data=='out':
                        yield data
                    else:
                        errors.extend(data)
                        del errors[:-2048]
            if not stop.is_set():
                code=child.wait(timeout=3)
                # Command stderr can include IDs; surface only a compact, sanitized diagnostic.
                detail=errors.decode(errors='replace').strip().splitlines()
                failures=[line for line in detail if re.search(r'failed|error|not found|invalid|denied|syntax',line,re.I)]
                diagnostic=' / '.join(failures[:2] or detail[:2]) or 'receiver exited'
                diagnostic=re.sub(r'(?i)(serial\S*\s*[:=]?\s*)\S+',r'\1[hidden]',diagnostic)
                raise RuntimeError(f'Receiver stopped ({code}): {diagnostic[:190]}')
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        child.stdout.close()
        child.stderr.close()


def wifi(interface,stop,emit,status):
    if not shutil.which('dumpcap'):
        if installed_path('dumpcap'):
            raise RuntimeError('dumpcap is installed but cannot execute as this user; activate the wireshark group or check sandbox capture permissions')
        raise RuntimeError('Install wireshark-common (dumpcap) and configure capture permissions; see the Linux guide')
    matching=[x for x in doctor()['wifi'] if x['name']==interface]
    if not matching or matching[0]['mode']!='monitor':
        raise RuntimeError(f'{interface} is not a monitor interface. Use a dedicated adapter; see Wi-Fi setup')
    parser=PcapStream()
    status('Listening · monitor mode · fixed channel '+str(matching[0]['channel'] or 'unknown'))
    command=['dumpcap','-i',interface,'-P','-s','4096','-f',WIFI_FILTER,'-q','-w','-']
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
                emit({**item,**meta,'type':'candidate' if 'signature' in item else 'rid','source':'wifi:'+interface,'received_at':stamp})


def ble(adapter,stop,emit,status):
    try:
        from bleak import BleakScanner
    except ImportError:
        raise RuntimeError('Install the BLE extra: pip install "./linux-node[ble]"') from None
    def found(device,advertisement):
        data=advertisement.service_data.get('0000fffa-0000-1000-8000-00805f9b34fb')
        if data and len(data)>=27 and data[0]==13 and MAC.fullmatch(device.address):
            emit({'type':'rid','source':'ble:'+adapter,'mac':device.address.upper(),'payload':bytes(data[2:]),
                  'protocol':'ble','received_at':time.time(),'rssi_dbm':advertisement.rssi})
    async def listen():
        # Advertisement Monitor is passive. Never silently fall back to active discovery.
        scanner=BleakScanner(found,scanning_mode='passive',
            bluez={'adapter':adapter,'or_patterns':[(0,0x16,b'\xfa\xff')]})
        async with scanner:
            status('Listening · passive Remote ID advertisements; PHY reception depends on controller / BlueZ')
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
    if not shutil.which(command[0]):
        raise RuntimeError('Install '+('hackrf' if kind=='hackrf' else 'rtl-sdr')+' tools using your Linux package manager')
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
    if file.is_symlink() or file.stat().st_mode & 0o077 or file.stat().st_uid!=os.getuid():
        raise ValueError('MQTT configuration must be owned by your user with permissions 600')
    if file.stat().st_size>8192:
        raise ValueError('MQTT configuration is too large')
    config=json.loads(file.read_text())
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
