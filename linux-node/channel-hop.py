#!/usr/bin/env python3
"""Optional Linux channel scheduler for one dedicated monitor radio.
Run separately from the unprivileged node. AGPL-3.0-or-later.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import subprocess
import threading

DEFAULT_CHANNELS = '6,1,6,11,6,2,6,3,6,4,6,5,6,7,6,8,6,9,6,10'


def channels(value):
    if not re.fullmatch(r'[0-9]{1,3}(?:,[0-9]{1,3}){0,63}', value):
        raise ValueError('Use a comma-separated list of up to 64 channel numbers')
    result = [int(x) for x in value.split(',')]
    if any(x < 1 or x > 196 for x in result):
        raise ValueError('Channel out of range')
    return result


def available_channels(text):
    result = set()
    for block in re.split(r'(?=\* [0-9]+ MHz \[)', text):
        match = re.match(r'\* ([0-9]+) MHz \[([0-9]+)\]', block)
        if match and 2400 <= int(match[1]) <= 5900 and not any(flag in block.lower() for flag in ('disabled','radar detection','no ir','no-ir')):
            result.add(int(match[2]))
    return result


class Radio:
    def __init__(self, interface, run=None):
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,14}', interface):
            raise ValueError('Invalid monitor interface name')
        self.interface = interface
        self.run = run or self.command
        self.phy = None
        self.original = None

    @staticmethod
    def command(tool, *args):
        executable = next((p for p in ('/usr/sbin/'+tool, '/sbin/'+tool, '/usr/bin/'+tool) if Path(p).is_file()), None)
        if not executable:
            raise ValueError('Install '+tool+' first')
        result = subprocess.run([executable,*args], capture_output=True, text=True, timeout=3)
        if result.returncode:
            raise ValueError(tool+' failed: '+result.stderr.strip()[:180])
        return result.stdout

    def check(self):
        info = self.run('iw','dev',self.interface,'info')
        phy = re.search(r'\bwiphy ([0-9]+)', info)
        channel = re.search(r'\bchannel ([0-9]+)', info)
        if not phy or not re.search(r'\btype monitor\b', info) or not channel:
            raise ValueError('Choose an existing monitor interface with a set channel')
        current_phy = 'phy'+phy[1]
        if self.phy is not None and current_phy != self.phy:
            raise ValueError('The interface moved to another radio; stopping')
        self.phy = current_phy
        if self.original is None:
            self.original = int(channel[1])
        links = json.loads(self.run('ip','-j','link','show'))
        up = {item['ifname'] for item in links if 'UP' in item.get('flags',[])}
        if self.interface not in up:
            raise ValueError('Bring the monitor interface up before hopping')
        for block in self.run('iw','dev').split('phy#')[1:]:
            if block.splitlines()[0].strip() == phy[1]:
                siblings = re.findall(r'\bInterface (\S+)', block)
                if any(name != self.interface and name in up for name in siblings):
                    raise ValueError('Another interface on this radio is up. Use a dedicated radio; leave the Internet radio alone.')
        return available_channels(self.run('iw','phy',self.phy,'info'))

    def tune(self, channel):
        self.run('iw','dev',self.interface,'set','channel',str(channel))


def hop(radio, plan, dwell, stop, report=print):
    allowed = radio.check()
    missing = sorted(set(plan)-allowed)
    if missing:
        raise ValueError('Channels unavailable for this radio/regulatory configuration: '+','.join(map(str,missing)))
    try:
        while not stop.is_set():
            for channel in plan:
                if stop.is_set():
                    break
                if channel not in radio.check():
                    raise ValueError('Channel availability changed; stopping')
                radio.tune(channel)
                report(f'{radio.interface} · channel {channel} · {dwell:g}s')
                if stop.wait(dwell):
                    break
    finally:
        try:
            if radio.original in radio.check():
                radio.tune(radio.original)
                report(f'Restored {radio.interface} to channel {radio.original}')
        except (OSError,ValueError,subprocess.SubprocessError):
            report('Could not restore the original channel; check the adapter before restarting.')


def main():
    if sys.platform != 'linux':
        raise ValueError('The monitor channel helper runs on Linux only')
    parser = argparse.ArgumentParser(description='DRONEmapper optional Linux monitor channel hopping')
    parser.add_argument('--interface', required=True)
    parser.add_argument('--channels', default=DEFAULT_CHANNELS)
    parser.add_argument('--dwell', type=float, default=.75)
    args = parser.parse_args()
    if not .25 <= args.dwell <= 5:
        raise ValueError('Dwell must be between 0.25 and 5 seconds')
    plan = channels(args.channels)
    if os.geteuid() != 0:
        raise ValueError('Run this small channel helper with sudo; run the dashboard as your normal user')
    radio = Radio(args.interface)
    radio.check()
    lock_path = '/run/lock/dronemapper-hop-'+radio.phy
    fd = os.open(lock_path, os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != 0 or not stat.S_ISREG(info.st_mode):
            raise ValueError('Unsafe channel-helper lock file')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('A channel hopper is already running on this radio') from None
        stop = threading.Event()
        for sig in (signal.SIGINT,signal.SIGTERM):
            signal.signal(sig, lambda *_:stop.set())
        print('Hopping on '+args.interface+'. Ctrl+C stops and restores its original channel.', flush=True)
        hop(radio, plan, args.dwell, stop, lambda text:print(text,flush=True))
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except (OSError,ValueError,subprocess.SubprocessError) as error:
        raise SystemExit('DRONEmapper: '+str(error))
