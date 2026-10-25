"""Local vendor evidence and reviewed hardware references, not drone identities."""
import json
from pathlib import Path
import re

REFERENCES = json.loads((Path(__file__).with_name('data') / 'security-device-references.json').read_text(encoding='utf-8'))


def vendor_hint(address):
    if not isinstance(address, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}', address):
        return None
    mac = address.replace(':', '').upper()
    if int(mac[:2], 16) & 3:
        return None
    for vendor in REFERENCES['vendors']:
        if any(isinstance(prefix,str) and re.fullmatch(r'(?:[0-9A-F]{6}|[0-9A-F]{7}|[0-9A-F]{9})',prefix)
               and mac.startswith(prefix) for prefix in vendor['prefixes']):
            return {'vendor_id': vendor['id'], 'vendor_name': vendor['name'], 'vendor_url': vendor['url'],
                    'identification': 'MAC allocation match only; device type and model unknown'}
    return None


def ethernet_arp(packet):
    """Observe only the sender of a well-formed Ethernet/IPv4 ARP (0–2 VLAN tags).

    Do not infer a target's presence from a request, retain IP addresses, decode
    video, or send traffic. MAC addresses and ARP claims are unauthenticated.
    """
    if len(packet) < 42:
        return None
    sender = ':'.join(f'{b:02X}' for b in packet[6:12])
    hint = vendor_hint(sender)
    if hint is None:
        return None
    offset, ethertype, tags = 14, int.from_bytes(packet[12:14], 'big'), 0
    while ethertype in (0x8100, 0x88a8):
        if tags == 2 or len(packet) < offset + 4:
            return None
        ethertype = int.from_bytes(packet[offset+2:offset+4], 'big')
        offset += 4
        tags += 1
    if ethertype != 0x0806 or len(packet) < offset + 28:
        return None
    arp = packet[offset:offset+28]
    if arp[:6] != b'\0\x01\x08\0\x06\x04' or arp[6:8] not in (b'\0\x01', b'\0\x02') or arp[8:14] != packet[6:12]:
        return None
    return {'mac': sender, 'protocol': 'ethernet-arp', **hint}
