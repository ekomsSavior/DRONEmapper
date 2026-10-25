"""DRONEmapper desktop node command line. AGPL-3.0-or-later."""
import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
from . import __version__
from .account import ApiError
from .dashboard import make_server
from .engine import Engine
from .radios import doctor
from .storage import Store, BANDS
from .platform_support import state_directory, system


def parser():
    p=argparse.ArgumentParser(description='DRONEmapper stationary desktop node · Church of Malware / saviorSEC')
    p.add_argument('--version',action='version',version=__version__)
    p.add_argument('--data-dir',default=str(state_directory()))
    commands=p.add_subparsers(dest='command',required=True)
    commands.add_parser('doctor',help='Report receiver capabilities without starting a scan')
    commands.add_parser('status',help='Show saved settings and queue counts; stop a running node first')
    commands.add_parser('pair',help='Pair using browser approval, without entering an account password here')
    commands.add_parser('disconnect',help='Forget this computer’s credential; manage server revocation on your account page')
    commands.add_parser('wifi-help',help='Show dedicated monitor-interface setup commands')
    config=commands.add_parser('configure',help='Save receiver choices while the node is stopped')
    config.add_argument('--wifi',action='append',dest='wifi_interfaces',help='Dedicated monitor interface; repeat for several radios')
    config.add_argument('--lan-interface',help='Optional local Ethernet/managed interface for passive vendor discovery; empty disables')
    config.add_argument('--ble',dest='ble_adapter',help='System controller: default on Windows / macOS, hci0 on Linux; empty disables')
    config.add_argument('--sdr-mode',choices=['spectrum','adsb','dji'])
    config.add_argument('--dji-frequency',type=float,help='Fixed DJI research channel in MHz')
    config.add_argument('--readsb-file',help='Existing local aircraft.json; empty string disables')
    config.add_argument('--sdr',choices=['off','hackrf','rtl'])
    config.add_argument('--band',dest='sdr_band',choices=list(BANDS))
    config.add_argument('--location',nargs=2,type=float,metavar=('LAT','LON'))
    config.add_argument('--label')
    config.add_argument('--mqtt-file')
    config.add_argument('--serial-port',help='USB serial port; empty disables')
    config.add_argument('--serial-baud',type=int,default=None)
    config.add_argument('--serial-format',choices=['marauder','remoteid-json'])
    config.add_argument('--share-rid',action=argparse.BooleanOptionalAction,default=None)
    config.add_argument('--share-decoded',action=argparse.BooleanOptionalAction,default=None)
    config.add_argument('--share-robots',action=argparse.BooleanOptionalAction,default=None)
    config.add_argument('--share-areas',action=argparse.BooleanOptionalAction,default=None)
    serve=commands.add_parser('serve',help='Open the local radar/control dashboard')
    serve.add_argument('--port',type=int,default=8790)
    serve.add_argument('--open',action='store_true',help='Open the local dashboard in your browser')
    serve.add_argument('--listen',action='store_true',help='Start saved receivers immediately')
    commands.add_parser('run',help='Run saved receivers without the dashboard; print live detections as JSON lines')
    capture=commands.add_parser('capture-iq',help='Record up to three seconds of receive-only HackRF IQ, 20 Msps / cs8')
    capture.add_argument('--frequency-mhz',type=float,required=True)
    capture.add_argument('--seconds',type=float,default=1)
    capture.add_argument('--output',required=True)
    decode=commands.add_parser('decode-dji',help='Decode a recorded DJI DroneID IQ file locally; never upload/replay as live')
    decode.add_argument('capture')
    decode.add_argument('--sample-rate',type=float,required=True,help='Complex samples per second, e.g. 20000000')
    decode.add_argument('--format',dest='sample_format',choices=['cf32','cs8'],default='cf32')
    decode.add_argument('--skip-detection',action='store_true',help='Only for an isolated burst of at most 20 ms')
    decode.add_argument('--output',required=True,help='New private review JSON file; existing files are not overwritten')
    return p


WIFI_HELP='''Use a dedicated Wi-Fi adapter, separate from your Internet connection.
1. Install iw and wireshark-common using your distribution’s package manager.
2. Enable non-root dumpcap capture using your distribution’s Wireshark instructions.
3. Find the dedicated adapter’s PHY: iw dev
4. Replace phy1 with that adapter’s PHY, then run:
   sudo iw phy phy1 interface add dmmon0 type monitor
   sudo ip link set dmmon0 up
   sudo iw dev dmmon0 set channel 6
5. Configure the node: dronemapper-node configure --wifi dmmon0
Use channel 149 only where the adapter/regulatory configuration supports it.
Multiple dedicated adapters can watch different channels simultaneously.
Optional Linux hopping (in a separate terminal):
sudo python3 linux-node/channel-hop.py --interface dmmon0
The helper prioritizes channel 6, checks supported channels, and restores the
original channel on exit. One radio can listen to only one channel at a time.
Cleanup: sudo iw dev dmmon0 del
Do not switch the computer’s Internet Wi-Fi interface into monitor mode.
'''


DESKTOP_WIFI_HELP="Install Wireshark. Windows also needs Npcap with raw 802.11 / monitor capture enabled.\nmacOS needs Wireshark capture permissions (ChmodBPF). Restart Terminal after setup.\nUse a dedicated Wi-Fi adapter; monitor mode can disconnect its Internet connection.\nRun: dumpcap -D\nCopy the dedicated adapter name into the dashboard's Wi-Fi field, then Start listening.\nThe node requests monitor mode and verifies raw 802.11 support before reading frames.\nA managed/Ethernet-only driver is not sufficient. Many USB Wi-Fi drivers lack monitor\nsupport on Windows or macOS even when the same adapter works on Linux.\nChannel selection is controlled by the OS/driver; this node does not hop channels.\nBLE, SDR and account linking work independently of monitor capture.\n"

def main(argv=None):
    args=parser().parse_args(argv)
    if args.command=='doctor':
        print(json.dumps(doctor(),indent=2))
        return
    if args.command=='wifi-help':
        print(WIFI_HELP if system()=='Linux' else DESKTOP_WIFI_HELP)
        return
    if args.command=='capture-iq':
        from .capture import capture_iq
        try:
            print(json.dumps(capture_iq(args.output,args.frequency_mhz,args.seconds),indent=2))
        except (OSError,ValueError) as error:
            print('DRONEmapper: '+str(error),file=sys.stderr)
            raise SystemExit(1)
        return
    if args.command=='decode-dji':
        from .decoders import decode_dji_file
        try:
            # Create exclusively before expensive work, never overwrite a user capture/report.
            fd=os.open(Path(args.output).expanduser(),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            try:
                with os.fdopen(fd,'w') as output:
                    report=decode_dji_file(args.capture,args.sample_rate,args.sample_format,args.skip_detection)
                    json.dump(report,output,indent=2,allow_nan=False)
            except BaseException:
                Path(args.output).expanduser().unlink(missing_ok=True)
                raise
            print(f"Decoded {report['decoded_packets']} CRC-valid packets; {report['rejected_candidates']} candidates rejected. Saved local review: {args.output}")
        except (OSError,ValueError) as error:
            print('DRONEmapper: '+str(error),file=sys.stderr)
            raise SystemExit(1)
        return
    store=None
    engine=None
    server=None
    stop=threading.Event()
    try:
        store=Store(args.data_dir)
        if args.command=='status':
            print(json.dumps({'version':__version__,'connected':store.connected(),'settings':store.settings(),'counts':store.counts()},indent=2))
            return
        if args.command=='configure':
            values=store.settings()
            for k in values:
                value=getattr(args,k,None)
                if value is not None:
                    values[k]=value
            if args.location is not None:
                values['station']=args.location
            store.update(values)
            print('Saved. Start with dronemapper-node serve or dronemapper-node run.')
            return
        if args.command=='disconnect':
            store.disconnect()
            print('Local credential removed. Revoke the node on the website to remove server access and its reports.')
            return
        engine=Engine(store)
        def finish(*_):
            stop.set()
        signal.signal(signal.SIGTERM,finish)
        signal.signal(signal.SIGINT,finish)
        if args.command=='pair':
            pair=engine.connection.start()
            print('Open: '+pair['verification_url'])
            print('Confirm code: '+pair['user_code'],flush=True)
            while not stop.wait(1) and engine.connection.public_pair():
                pass
            print('Connected. Sharing remains off; enable it in configure or the dashboard.' if store.connected() else 'Pairing ended. Run pair again when ready.')
        elif args.command=='serve':
            server=make_server(engine,args.port)
            server.timeout=.5
            if args.listen:
                engine.start()
            print(f'DRONEmapper Desktop {__version__} · Church of Malware / saviorSEC\nOpen http://127.0.0.1:{server.server_port}/',flush=True)
            if args.open:
                import webbrowser
                webbrowser.open(f'http://127.0.0.1:{server.server_port}/')
            while not stop.is_set():
                server.handle_request()
        elif args.command=='run':
            engine.start()
            last={}
            last_status=None
            while not stop.wait(1):
                view=engine.snapshot()
                for contact in view['contacts']+view['network_devices']:
                    if contact['seen']>last.get(contact['key'],0)+5:
                        print(json.dumps(contact,ensure_ascii=True),flush=True)
                        last[contact['key']]=contact['seen']
                last={k:v for k,v in last.items() if time.time()-v<120}
                status=json.dumps({'radios':view['radios'],'upload':view['upload_status']})
                if status!=last_status:
                    print(status,file=sys.stderr,flush=True)
                    last_status=status
    except (OSError,ValueError,ApiError) as error:
        print('DRONEmapper: '+str(error),file=sys.stderr)
        raise SystemExit(1)
    finally:
        if server:
            server.server_close()
        if engine:
            engine.close()
        if store:
            store.close()
