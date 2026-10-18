"""Bounded receive-only HackRF IQ capture for local decoder review."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from .protocol import finite


def capture_iq(path, frequency_mhz, seconds):
    if not finite(frequency_mhz,2390,2500) and not finite(frequency_mhz,5725,5875):
        raise ValueError('Choose a DJI research frequency in 2390–2500 or 5725–5875 MHz')
    if not finite(seconds,.1,3):
        raise ValueError('Capture duration must be 0.1–3 seconds')
    if not shutil.which('hackrf_transfer'):
        raise ValueError('Install the HackRF receive tools first')
    target=Path(path).expanduser()
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        count=round(seconds*20000000)
        start=time.time()
        command=['hackrf_transfer','-r',f'/proc/self/fd/{fd}','-f',str(round(frequency_mhz*1e6)),
                 '-s','20000000','-n',str(count),'-a','0','-p','0','-l','16','-g','20']
        try:
            result=subprocess.run(command,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                                  stderr=subprocess.PIPE,pass_fds=(fd,),timeout=seconds+15)
        except subprocess.TimeoutExpired as error:
            raise ValueError('HackRF capture timed out; check the USB connection') from error
        if result.returncode:
            raise ValueError('HackRF capture failed. Stop its spectrum/ADS-B receiver first and check USB access.')
        size=os.fstat(fd).st_size
        if not 0<size<=2*count+262144 or size%2:
            raise ValueError('HackRF returned an invalid IQ capture size')
        return {'mode':'recorded-capture','sample_format':'cs8','sample_rate':20000000,
                'frequency_mhz':frequency_mhz,'started_at':start,'samples':size//2,
                'duration_seconds':size/40000000,'output':str(target)}
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    finally:
        os.close(fd)
