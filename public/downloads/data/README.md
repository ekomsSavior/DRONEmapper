# DRONEmapper research data

One combined JSON and three focused CSVs. These are reproducible exports of the
catalogs used by DRONEmapper, with reviewed additions from contributed research.
They cover drones, aircraft, autonomous vehicles, robot dogs, other ground robots,
and related equipment. They are not a claim to contain every product worldwide.

Preview and download from [Device Library](https://dronemapper.churchofmalware.org/devices#research-data).
Source and history: [GitHub](https://github.com/ekomsSavior/DRONEmapper/tree/main/public/downloads/data)
or [Gitea](https://git.churchofmalware.org/ek0mssavi0r/DRONEmapper/src/branch/main/public/downloads/data).
`manifest.json` gives the release, exact record counts, column names, byte sizes,
input hashes and SHA-256 hashes. `SHA256SUMS.txt` verifies all four data files and
the manifest. No account or token is needed to download them.

## Files and scope

| File | Contents | Appropriate use |
| --- | --- | --- |
| `devices-global.json` | Combined models/programs, regulatory equipment, MAC allocations, RID rules, RF references, robot patterns, cloud services, documented vendor flows, product associations and source links | Research databases and cross-referenced tools |
| `oui-global.csv` | Simple `device,oui` list for selected drone, autonomous-vehicle, robot and related equipment manufacturers | Relevant manufacturer allocations; not model identification |
| `rid-prefixes.csv` | Every reviewed bounded rule from the scanner's RID catalog | Model candidates for a valid full CTA-2063 serial |
| `rf-channels.csv` | Reviewed frequency centers, channel spans and DRONEmapper spectrum profiles | Receiver planning and understanding decoder coverage |

These version-1 schemas replace the older small contributed CSV formats. Read
headers rather than depending on column positions. No private observations,
precise receiver coordinates, credentials or applicant contact records are included.

## Global JSON, schema version 1

- `devices` combines all curated device references, the saved public map model
  inventory, Remote ID declaration models and the contributed FCC equipment
  index. `catalog_id` is a stable identifier based on manufacturer/name/record
  kind or exact FCC ID. It does not identify a physical unit. `kind` separates
  equipment from aircraft/vehicle/program entries.
- `catalog_evidence` describes each entry's basis. Map inventory aggregates are
  dated context, not live positions. `records` counts observations or program
  records, not individual devices. Inventory timestamp is separate from release.
- `remote_id_rule_ids` joins a model to `remote_id_rules` without discarding any
  serial boundaries or decimal restrictions. Exact manufacturer/model aliases
  are used; ambiguous or different names remain separate records.
- Each `devices` entry includes `mac_allocations`, `rf_information` and
  `scanner_signatures`. MAC entries retain exact prefixes, bit lengths, registrants
  and manufacturer-only scope; they are not observed MAC addresses or model proof.
  RF entries contain the available model communications, exact firmware patterns,
  BLE channel references, or associated FCC equipment bands with their evidence
  status. Empty arrays mean no supported association in this release. Generic
  channels are not assigned to every device; pending FCC grant values stay pending.
  Rules are joined by exact manufacturer/model aliases, never by similar names.
- `radio_allocations` has the same facts as the MAC CSV; shared provenance is in
  `radio_allocation_provenance`. Only the reviewed device-manufacturer allowlist
  is included. Each record keeps its exact registrant and prefix length.
  A registrant does not prove a particular model or operator.
- `robot_signatures`, `rf_channels`, `cloud_services` and `vendor_flows` preserve
  their source catalogs and evidence limits. Cloud service IDs are vendor-level
  references, not an assertion that every vendor device uses those services.
- `equipment_product_relationships` distinguishes manufacturer-published links
  from contributed associations. The four supplied FCC files are combined in
  this JSON; there are no separate vendor downloads. Supplied grant dates,
  frequency ranges and notes remain explicitly pending where the primary grant
  could not be reviewed. Skydio's manufacturer e-label source corrects the X10
  cellular module ID to `RI7FN990A40` for the specified variants.
- `catalog_references` preserves every original curated reference field, including
  aliases, specifications, citations and reception notes. `device_links` adds our
  model/manufacturer link registry. `equipment_input_provenance` hashes the four
  contributed inputs without publishing personal contact details.
- `counts` reports collection sizes. `complete: false` in a vendor flow means
  public documentation does not establish a complete internal network topology.

An empty frequency list means unknown, not absence of a radio. A module grant
must not be attributed to every vehicle from the same manufacturer. Generic
Wi-Fi/BLE frequencies, cert-log hostnames and MAC allocations are not unique
signatures. FCC listings do not create map sightings or scanner detections.

```python
import json
from pathlib import Path

catalog = json.loads(Path('devices-global.json').read_text(encoding='utf-8'))
assert catalog['schema_version'] == 1
for device in catalog['devices']:
    if device['maker'].casefold() == 'skydio':
        print(device['catalog_id'], device['name'], device['catalog_evidence'])
```

## MAC allocations CSV

Two columns: `device` and `oui`. The device label names the manufacturer family;
it does not assert a particular model. This list includes reviewed drone,
autonomous-vehicle, robot and associated equipment manufacturers only.

Ordinary 24-bit prefixes use `00:12:1C` notation. Smaller allocations retain their
complete masks, for example `E8:B4:70:C0:00:00/28` and
`8C:1F:64:76:30:00/36`. Zeros after the mask boundary are padding, not additional
fixed address bits. Never truncate these to three bytes. Keep identifiers as text,
match the longest prefix first, and exclude multicast and locally administered
addresses. The combined JSON retains exact hexadecimal prefixes and bit lengths.

Devices with no verified allocation are omitted rather than assigned a generic
Wi-Fi chip vendor or another company's similarly named allocation. Sources and
snapshot dates for the selected facts are retained in `integration/device-oui.json`
and the combined JSON. The CSV intentionally contains no source-link columns.

## Remote ID rules CSV

Despite its legacy filename, this file contains bounded serial rules, not loose
manufacturer prefixes. First validate a CTA-2063 serial: four-character maker
code, hexadecimal length code and allowed serial alphabet, with the indicated
length. Require `serial_length` and the same `manufacturer_code`/`length_code`.
Compare the full string to inclusive `serial_start`/`serial_end`. If
`decimal_suffix` is nonzero, additionally require exactly that many trailing
ASCII digits and an unchanged preceding string. Zero means no extra decimal
constraint. Never collapse multiple rules into one minimum/maximum range.

Return every matching candidate; do not silently choose the first if different
models overlap. `device_type` distinguishes an aircraft from an add-on module.
`identity_authenticated` is false: a broadcast identifier can be spoofed.
`reviewed_at` is the source rule's review date, not a fresh FAA revalidation date.
The reference matcher is `worker/node-records.mjs`; the source catalog is
`worker/rid-catalog.mjs`.

## Radio channels CSV

All frequencies are MHz. `frequency_mhz` is a center frequency; alternatively,
`range_start_mhz` and `range_end_mhz` describe a span. Empty fields mean unknown
or not applicable, never zero. `bandwidth_mhz` is separate from
`channel_spacing_mhz`; a span is not necessarily occupied signal bandwidth.
Read `bandwidth_basis`, `decoder_scope`, `identity_scope`, `receiver` and `notes`.

BLE advertisement decoding uses a compatible Bluetooth controller/OS, not a
bundled SDR BLE demodulator. DJI legacy DroneID channels do not cover every DJI
product. ADS-B alone does not establish unmanned flight. GPS signals come from
satellites and do not reveal a nearby robot's position. Automotive radar is
outside a HackRF's direct receive range; ordinary RTL-SDR cannot receive 2.4 or
5 GHz directly. Spectrum profiles measure activity and do not identify devices.
Regulatory domains and actual equipment configurations differ; these are
research references, not permission to transmit.

## CSV parsing and spreadsheet use

UTF-8, comma-delimited, RFC-style quoting and CRLF line endings. Import identifiers
as text. To prevent spreadsheet formula evaluation, text beginning with a formula
marker (including after whitespace), tab/newline or apostrophe is prefixed with
one apostrophe. Programmatic readers may remove exactly one leading apostrophe
from text cells to recover the original value. JSON retains the original text.

## Rebuild and validate

From the source repository, with Python 3 and Node.js available:

```sh
python3 scripts/export_developer_data.py
python3 scripts/export_developer_data.py --check
python3 -m unittest discover -s tests -p 'test_developer_data.py'
```

Generation is offline and deterministic. It reads the shared reviewed catalogs,
not the private research folder. New contributed evidence must be reviewed before
updating those canonical inputs. `--check` detects stale files without writing.
The site package build also checks these exports.

## Attribution and reuse

DRONEmapper compilation and code: Church of Malware / saviorSEC; see the repository
LICENSE and NOTICE files. Source material retains its own applicable terms;
this download does not relicense third-party documents or datasets.

Selected MAC allocation facts were checked against IEEE Registration Authority
snapshots dated October 20–22, 2026. No general OUI database is bundled in these
research exports.
Remote ID allocation evidence: linked FAA declarations. RF references credit
Bluetooth SIG, Linux wireless, Betaflight, ExpressLRS, proto17/dji_droneid,
readsb, FAA, USCG and regulatory publications in each row. Product and network
references link their respective manufacturer or project documentation.
Retain source links, review dates, evidence scope and this attribution when sharing.
