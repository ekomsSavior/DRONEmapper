"""Historical UAV records adapter; code AGPL-3.0-or-later.

Adapted map data: Jim Lee / ClimateViewer, CC BY-NC-SA 4.0. This is a
separate historical layer, never evidence of a current flight or deployment.
Only structured authorization/base records are accepted, not reference markers,
undocumented pins, planned bases or undated Active/Expired duplicate summaries.
"""
import hashlib
from html.parser import HTMLParser
import re
import time
from data_sources import clean, finite, fetch_json, https

CLIMATE_URL = 'https://climateviewer.org/layers/geojson/2018/UAV-Drones-over-USA-ClimateViewer-3D.geojson'
CLIMATE_PAGE = 'https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/'
CLIMATE_LICENSE = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.links = []
    def handle_data(self, data):
        self.parts.append(data)
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.links.extend(v for k,v in attrs if k == 'href' and https(v))


def field(text, label, following):
    match = re.search(re.escape(label) + r'\s*(.*?)(?=' + '|'.join(re.escape(f) for f in following) + r'|$)', text)
    return clean(match.group(1), 250) if match else ''


def normalize_climateviewer(payload, collected_at=None):
    if not isinstance(payload, dict) or not isinstance(payload.get('features'), list):
        raise ValueError('Invalid historical map')
    collected_at = time.time() if collected_at is None else collected_at
    output = {}
    for feature in payload['features']:
        if not isinstance(feature, dict):
            continue
        p, g = feature.get('properties', {}), feature.get('geometry', {})
        if not isinstance(p, dict) or not isinstance(g, dict):
            continue
        coords = g.get('coordinates', [])
        if g.get('type') != 'Point' or not isinstance(coords, list) or len(coords) < 2:
            continue
        lon, lat = coords[:2]
        if not finite(lat, -90, 90) or not finite(lon, -180, 180) or (lat == 0 and lon == 0):
            continue
        parser = PlainText()
        parser.feed(str(p.get('description', ''))[:100000])
        text = re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()
        name = clean(p.get('name'))
        if not name:
            continue
        dates = ''
        if 'Governmental Body/Entity:' in text and 'Type of Drone:' in text:
            operator = field(text, 'Governmental Body/Entity:', ['Type of Drone:'])
            model = field(text, 'Type of Drone:', ['Status:'])
            place = field(text, 'General Location of Drone Activity:', ['Stated objective/purpose of COA:'])
            dates = field(text, 'Effective Dates:', ['Comments:', 'Link to Records:'])
            status = 'historical-authorization'
        elif 'Service Branch:' in text and 'Types of UAS:' in text and 'UAS Activities Status:' in text:
            prior_status = field(text, 'UAS Activities Status:', ['Source:', 'Location Details:'])
            if prior_status.lower() != 'current':
                continue
            operator = field(text, 'Service Branch:', ['Types of UAS:'])
            model = field(text, 'Types of UAS:', ['UAS Activities Status:'])
            place, status = name, 'historical-base'
        else:
            continue
        if not operator or not model:
            continue
        purpose = 'unknown'
        if re.search(r'\b(police|sheriff|fire|emergency|public safety)\b', operator, re.I):
            purpose = 'public-safety'
        elif re.search(r'\b(air force|army|navy|marine corps|special operations command)\b', operator, re.I):
            purpose = 'defense'
        years = [int(y) for y in re.findall(r'\b(?:19|20)\d{2}\b', dates) if int(y) <= 2018]
        identity = '|'.join(map(str, [name, lat, lon, model, dates]))
        key = 'history:' + hashlib.sha256(identity.encode()).hexdigest()[:18]
        output[key] = {
            'id': key, 'record_type': 'historical', 'kind': 'drone', 'domain': 'air',
            'name': name, 'model': model, 'manufacturer': None, 'operator': operator,
            'purpose': purpose, 'latitude': lat, 'longitude': lon, 'place': place or name,
            'status': status, 'first_year': min(years) if years else None,
            'record_dates': dates or None, 'archive_year': 2018,
            'observed_at': None, 'collected_at': collected_at,
            'precision': 'Historical reported area; not a vehicle position',
            'source': 'climateviewer', 'source_url': CLIMATE_URL,
            'evidence_url': next((u for u in parser.links if u.startswith('https://www.eff.org/')), CLIMATE_PAGE),
            'attribution': 'Jim Lee / ClimateViewer — adapted historical map data',
            'license': 'CC BY-NC-SA 4.0', 'license_url': CLIMATE_LICENSE,
            'verification': 'Historical published authorization/base record; current activity unverified'
        }
    return list(output.values())


def fetch_climateviewer():
    return normalize_climateviewer(fetch_json(CLIMATE_URL))
