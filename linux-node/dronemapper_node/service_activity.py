"""Bounded local DNS-question recognition; never a device or location claim."""
import json
from pathlib import Path
import re

REFERENCES = json.loads((Path(__file__).with_name('data') / 'service-references.json').read_text(encoding='utf-8'))
QUERY_TYPES = {1: 'A', 28: 'AAAA', 64: 'SVCB', 65: 'HTTPS'}


def domain_hint(name):
    if not isinstance(name, str) or len(name) > 253:
        return None
    name = name.lower().removesuffix('.')
    labels = name.split('.')
    if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in labels):
        return None
    for platform in REFERENCES['platforms']:
        for domain in platform['domains']:
            if name == domain or name.endswith('.' + domain):
                # Keep only the reviewed base domain, not a possible tenant/caller subdomain.
                return {'service_id': platform['id'], 'service_name': platform['name'],
                        'service_url': platform['url'], 'domain': domain,
                        'identification': 'Domain lookup only; device type and service use unknown'}
    return None


def dns_question(payload):
    """Accept one ordinary IN question, not replies, compressed names or updates."""
    if not 17 <= len(payload) <= 4096:
        return None
    flags = int.from_bytes(payload[2:4], 'big')
    # QR/opcode/AA/TC/Z/rcode must be zero. RD/RA/AD/CD do not identify a device.
    if flags & 0xfe4f or payload[4:6] != b'\0\1' or payload[6:10] != bytes(4):
        return None
    offset, labels, size = 12, [], 0
    while offset < len(payload):
        length = payload[offset]
        offset += 1
        if length == 0:
            break
        if length > 63 or offset + length > len(payload):
            return None
        try:
            label = payload[offset:offset+length].decode('ascii')
        except UnicodeDecodeError:
            return None
        labels.append(label)
        size += length + 1
        if size > 254:
            return None
        offset += length
    else:
        return None
    if offset + 4 > len(payload) or payload[offset+2:offset+4] != b'\0\1':
        return None
    qtype = int.from_bytes(payload[offset:offset+2], 'big')
    hint = domain_hint('.'.join(labels))
    if hint and qtype in QUERY_TYPES:
        return {**hint, 'protocol': 'dns-query', 'query_type': QUERY_TYPES[qtype]}
    return None


def ethernet_dns(packet):
    """Ethernet + up to two VLAN tags, unfragmented IPv4/IPv6 UDP port 53.

    No TCP reassembly, IPv6 extensions, encrypted DNS, application data or DNS
    responses. IP/MAC addresses and full question names never leave this parser.
    """
    if len(packet) < 14:
        return None
    offset, ethertype, tags = 14, int.from_bytes(packet[12:14], 'big'), 0
    while ethertype in (0x8100, 0x88a8):
        if tags == 2 or len(packet) < offset + 4:
            return None
        ethertype = int.from_bytes(packet[offset+2:offset+4], 'big')
        offset += 4
        tags += 1
    ip = packet[offset:]
    if ethertype == 0x0800:
        if len(ip) < 20 or ip[0] >> 4 != 4 or ip[9] != 17:
            return None
        header, total = (ip[0] & 15) * 4, int.from_bytes(ip[2:4], 'big')
        if header < 20 or total < header + 8 or total > len(ip) or int.from_bytes(ip[6:8], 'big') & 0xbfff:
            return None
        udp = ip[header:total]
    elif ethertype == 0x86dd:
        if len(ip) < 48 or ip[0] >> 4 != 6 or ip[6] != 17:
            return None
        length = int.from_bytes(ip[4:6], 'big')
        if length < 8 or length + 40 > len(ip):
            return None
        udp = ip[40:40+length]
    else:
        return None
    length = int.from_bytes(udp[4:6], 'big')
    if udp[2:4] != b'\0\x35' or length != len(udp) or length < 25:
        return None
    return dns_question(udp[8:])
