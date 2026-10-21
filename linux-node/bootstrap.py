#!/usr/bin/env python3
"""Install local Python dependencies once, then open the desktop dashboard."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import venv


def main():
    parser=argparse.ArgumentParser(description='DRONEmapper Desktop · Church of Malware / saviorSEC')
    parser.add_argument('--update',action='store_true',help='Refresh dependencies after updating the source')
    parser.add_argument('--dji',action='store_true',help='Also install optional DJI decoder dependencies')
    args=parser.parse_args()
    if sys.version_info<(3,10):
        raise SystemExit('Install Python 3.10 or newer, then run this launcher again.')
    root=Path(__file__).resolve().parent
    directory=root/'.venv-desktop'
    python=directory/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    first=not python.exists()
    if first:
        print('Installing the desktop node in its own local Python environment…',flush=True)
        venv.EnvBuilder(with_pip=True).create(directory)
    marker=directory/'dronemapper-ready'
    version=(root/'dronemapper_node/__init__.py').read_text(encoding='utf-8').split('__version__ = ')[1].splitlines()[0].strip("\"'")
    if first or not marker.exists() or marker.read_text(encoding='utf-8').strip()!=version or args.update or args.dji:
        extras='all,dji' if args.dji else 'all'
        subprocess.run([str(python),'-m','pip','install',str(root)+'['+extras+']'],check=True)
        marker.write_text(version,encoding='utf-8')
    # Execute this checkout so source updates take effect without changing paired credentials.
    child=subprocess.Popen([str(python),str(root/'launch.py'),'serve','--open'])
    try:
        result=child.wait()
    except KeyboardInterrupt:
        # The terminal sends Ctrl+C to both processes. Allow receiver cleanup to finish.
        try:
            result=child.wait(timeout=20)
        except subprocess.TimeoutExpired:
            child.terminate()
            result=child.wait(timeout=5)
    raise SystemExit(result)


if __name__=='__main__':
    try:
        main()
    except (OSError,subprocess.CalledProcessError) as error:
        print('DRONEmapper setup failed: '+str(error),file=sys.stderr)
        raise SystemExit(1)
    except KeyboardInterrupt:
        print('\nStopped.')
