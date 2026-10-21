# Robot signals

Church of Malware / saviorSEC · Android 0.8.0 · Desktop 0.5.0

Start Bluetooth listening as usual. A supported CyberDog advertisement appears
in the live list and Signals radar as **Possible robot dog · CyberDog-style BLE**.
Tap its dot for signal strength and observation details. It supplies no position,
so the dot does not indicate bearing or distance.

**Share approximate robot signal areas** is a separate, initially disabled choice.
For the desktop CLI, use `dronemapper-node configure --share-robots` after setting
a station with `--location LAT LON`; `--no-share-robots` turns it off.
It uses a fresh phone location or the configured desktop station location, rounded
to the center of a 0.01° cell. The website displays a possible signal near that
receiver area. Radio addresses and advertised names remain local; uploads use a
node-specific pseudonym. Changing addresses may break continuity. Matching the
same prefix does not merge devices.

Android **Saved wardrives** can save these area reports without internet and upload
them later, keeping the original time. A fresh location fix is required to save a
robot map report. They are included in **DRONEmapper JSON**, not WiGLE Wi-Fi CSV.
Manually uploading a saved trip is separate from live sharing. Ordinary Bluetooth
devices and unmatched advertisements are not logged as robot sightings.

## What matches

All three fields must occur in the advertisement data delivered by the Bluetooth
stack:

| Field | Required value |
| --- | --- |
| Service UUID | `0000c420-0000-1000-8000-00805f9b34fb` |
| Local name | `铁蛋` followed by a 1–20 character printable ASCII suffix; one trailing LF is allowed because the manufacturer's serial-number command preserves it |
| Manufacturer data | Company `0xffff`, payload `00 01 02 03 04` |

These values come from the manufacturer's
[CyberDog RobotAdvertisement implementation](https://github.com/MiRoboticsLab/cyberdog_ros2/blob/9a8674e5009f0ea7c0736168dfbd8d501900a4cb/cyberdog_interaction/cyberdog_wireless/bluetooth/bluetooth/gattserver.py).
This is a pattern from that CyberDog software version, not a signature for every
CyberDog generation or all Xiaomi devices. No GATT connection, pairing, password
exchange, robot command or fleet-cloud request is made.

Advertisements are unauthenticated and can be imitated. The public record has no
asserted manufacturer, model or exact robot coordinates. It remains a signal,
never a flight track. After 14 days without another observation it becomes a ghost
under the same rules as other observed signals.

## Reception and testing

Android uses its existing Bluetooth LE scanner. Linux uses BlueZ passive monitors;
Windows uses Bleak discovery; macOS uses CoreBluetooth discovery and per-host
device UUIDs instead of radio MACs. Firmware and Bluetooth stacks differ in which
advertisement/scan-response fields they expose. Missing any required field means
no match. Passive receivers may miss a name transmitted only in a scan response.

Tests cover the required fields, malformed and stale input, separate radio
identities, consent, coarse coordinates, offline persistence, export format,
production validation, duplicate receipts and historical age. These are synthetic
software tests, never transmissions or public map records. **Physical reception
from a CyberDog has not been tested.**

Other robots and autonomous vehicles still need specific evidence and compatible
decoders. A shared `FFE0` service, MQTT/DDS port, Wi-Fi frequency, company hostname
or OUI allocation alone is insufficient. The broad frequency and network tables
in the research collection are references, not receiver detections.
