"""Optional passive LAN receiver. No probes, connections, video or IP retention."""
import re
import subprocess
import time
from .platform_support import tool_path, valid_interface
from .processes import process_bytes
from .protocol import PcapStream
from .security_devices import ethernet_arp

# Fixed offsets avoid libpcap's stateful `vlan` keyword. Keep only ARP, including
# up to two 802.1Q / 802.1ad tags; 96 bytes includes the entire needed header.
NETWORK_FILTER = ('ether[12:2] == 0x0806 or '
    '((ether[12:2] == 0x8100 or ether[12:2] == 0x88a8) and '
    '(ether[16:2] == 0x0806 or ((ether[16:2] == 0x8100 or ether[16:2] == 0x88a8) '
    'and ether[20:2] == 0x0806)))')


def interfaces():
    tool = tool_path('dumpcap')
    if not tool:
        return []
    try:
        result = subprocess.run([tool, '-D'], capture_output=True, text=True, timeout=5)
        if result.returncode:
            return []
        out = []
        for line in result.stdout.splitlines():
            match = re.match(r'^\d+\. (\S+)', line)
            if match and valid_interface(match[1]) and not re.fullmatch(r'any|lo[0-9]*|bluetooth[0-9]*|nflog|nfqueue|dbus.*',match[1]):
                out.append(match[1])
        return out
    except (OSError, subprocess.SubprocessError):
        return []


def receive(interface, stop, emit, status):
    tool = tool_path('dumpcap')
    if not tool:
        raise RuntimeError('Install Wireshark / dumpcap and enable capture access for passive LAN listening')
    if not valid_interface(interface) or interface not in interfaces():
        raise ValueError('Choose an attached LAN interface from Receiver status')
    check = subprocess.run([tool, '-i', interface, '-L'], capture_output=True, text=True, timeout=8)
    if check.returncode or not re.search(r'\bEN10MB\b', check.stdout):
        raise RuntimeError('LAN listening needs an Ethernet capture interface; do not use a monitor adapter')
    parser = PcapStream(linktypes=(1,))
    status('Listening · local ARP sender evidence · no network probes')
    command = [tool, '-i', interface, '-y', 'EN10MB', '-p', '-P', '-s', '96',
               '-f', NETWORK_FILTER, '-q', '-w', '-']
    for chunk in process_bytes(command, stop):
        for stamp, packet, _ in parser.feed(chunk):
            if not time.time()-120 <= stamp <= time.time()+5:
                continue
            emit({'type': 'network-frame'})
            match = ethernet_arp(packet)
            if match:
                emit({**match, 'type': 'vendor', 'source': 'lan:'+interface, 'received_at': stamp})
