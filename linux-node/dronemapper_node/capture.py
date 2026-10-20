"""Bounded receive-only HackRF IQ capture for local decoder review."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import tempfile
from contextlib import ExitStack
from .protocol import finite
from .platform_support import system, tool_path, private_directory, regular_fd


def capture_iq(path, frequency_mhz, seconds):
    if not finite(frequency_mhz,2390,2500) and not finite(frequency_mhz,5725,5875):
        raise ValueError('Choose a DJI research frequency in 2390–2500 or 5725–5875 MHz')
    if not finite(seconds,.1,3):
        raise ValueError('Capture duration must be 0.1–3 seconds')
    if not tool_path('hackrf_transfer'):
        raise ValueError('Install the HackRF receive tools first')
    target=Path(path).expanduser()
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_BINARY',0),0o600)
    try:
        count=round(seconds*20000000)
        start=time.time()
        with ExitStack() as cleanup:
            if system()=='Windows':
                directory=Path(cleanup.enter_context(tempfile.TemporaryDirectory(prefix='dronemapper-iq-')))
                private_directory(directory)
                output=str(directory/'capture.cs8')
                options={}
            else:
                output=f'/dev/fd/{fd}' if system()=='Darwin' else f'/proc/self/fd/{fd}'
                options={'pass_fds':(fd,)}
            command=[tool_path('hackrf_transfer'),'-r',output,'-f',str(round(frequency_mhz*1e6)),
                     '-s','20000000','-n',str(count),'-a','0','-p','0','-l','16','-g','20']
            try:
                result=subprocess.run(command,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                                      stderr=subprocess.PIPE,timeout=seconds+15,**options)
            except subprocess.TimeoutExpired as error:
                raise ValueError('HackRF capture timed out; check the USB connection') from error
            if result.returncode:
                raise ValueError('HackRF capture failed. Stop its spectrum/ADS-B receiver first and check USB access.')
            if system()=='Windows':
                # Use a binary file: some Windows tools translate bytes on stdout.
                with os.fdopen(regular_fd(output),'rb') as source:
                    if not 0<os.fstat(source.fileno()).st_size<=2*count+262144:
                        raise ValueError('HackRF returned an invalid IQ capture size')
                    with os.fdopen(os.dup(fd),'wb') as destination:
                        shutil.copyfileobj(source,destination,65536)
        size=os.fstat(fd).st_size
        if not 0<size<=2*count+262144 or size%2:
            raise ValueError('HackRF returned an invalid IQ capture size')
        return {'mode':'recorded-capture','sample_format':'cs8','sample_rate':20000000,
                'frequency_mhz':frequency_mhz,'started_at':start,'samples':size//2,
                'duration_seconds':size/40000000,'output':str(target)}
    except BaseException:
        os.close(fd)
        fd=None
        target.unlink(missing_ok=True)
        raise
    finally:
        if fd is not None:
            os.close(fd)
