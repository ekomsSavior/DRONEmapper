"""Isolated receive-only DJI burst worker; invoked by the Linux node."""
import argparse
import json
from pathlib import Path
import signal
import sys
import tempfile
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dronemapper_node.capture import capture_iq
from dronemapper_node.decoders import decode_dji_file, live_dji_records


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--frequency',type=float,required=True)
    args=parser.parse_args()
    # Let finally blocks remove private temporary IQ on receiver shutdown.
    def stopped(*_): raise SystemExit(0)
    signal.signal(signal.SIGTERM,stopped)
    try:
        with tempfile.TemporaryDirectory(prefix='dronemapper-dji-') as directory:
            iq=Path(directory)/'burst.cs8'
            while True:
                try:
                    capture=capture_iq(iq,args.frequency,.5)
                    report=decode_dji_file(iq,20000000,'cs8',max_candidates=8,deadline=time.monotonic()+30)
                    now=time.time()
                    events=live_dji_records(report,capture['started_at'],now,args.frequency)
                    print(json.dumps({'worker_status':f'DJI DroneID · {args.frequency:g} MHz · {report["decoded_packets"]} CRC-valid packets · {len(events)} fresh identities · capture / processing cycles'+(' · processing limit reached' if report['processing_limited'] else '')}),flush=True)
                    for event in events: print(json.dumps(event,allow_nan=False),flush=True)
                finally:iq.unlink(missing_ok=True)
                time.sleep(.25)
    except (OSError,ValueError) as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)

if __name__=='__main__': main()
