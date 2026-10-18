# Signals beyond Wi-Fi and Bluetooth

Research checked 17 October 2026 for DRONEmapper / saviorSEC, Church of Malware.
The implemented Linux SDR path is a **receive-only power spectrum**. It does not
claim a drone/robot identity from a peak. The following are decoder research paths,
not a list of devices this release can already identify.

| Signal / transport | Useful evidence | What is needed / limits |
|---|---|---|
| ASTM Remote ID over BLE / Wi-Fi | Reported ID, aircraft GPS, altitude, velocity, timestamp, RSSI | Implemented protocol-v2 Basic ID/Location; no SDR needed. Broadcast data is unverified. |
| DJI legacy DroneID in OcuSync 2.0 | Some older DJI models transmit identifying telemetry in a dedicated waveform | A model/protocol-specific OFDM decoder, suitable SDR bandwidth and checksum validation. Not a universal DJI decoder. |
| SiK / MAVLink telemetry | Owner-provided flight position, attitude, system/component IDs and sequence data | MAVLink is a message format; the modem/radio waveform must be decoded first. Prefer an owner's receiver output. |
| ExpressLRS telemetry | RC and, in supported modes, MAVLink telemetry on sub-GHz / 2.4 GHz | LoRa/FLRC and hopping details matter; activity alone cannot identify a drone. No ELRS decoder bundled. |
| 1090 MHz ADS-B / 978 MHz UAT | Positions/identity of equipped aircraft; only a subset are unmanned | Dedicated decoders and explicit UAV evidence. Do not classify every aircraft as a drone. |
| V2X at 5.9 GHz | Cooperative vehicle messages may report position/motion | ITS-G5 and C-V2X use different physical layers. V2X presence does not prove autonomy. |
| Maritime AIS | Position/identity of equipped vessels | An AIS decoder plus verified unmanned-vessel identity; AIS by itself is not an autonomy flag. |
| Proprietary robot Wi-Fi/cellular links | Owner-documented fleet telemetry may identify a deployment or device | No universal public robot beacon. Ordinary encrypted IP traffic does not expose location/model. |
| MQTT | A broker can distribute decoded receiver or fleet observations | Configure an authorized broker/topic and validate its schema; MQTT itself adds no RF reception. |

## Practical decoder priorities

1. Validate Linux Wi-Fi and BLE reception against a real Remote ID transmitter,
   including both message packs and split Basic ID/Location packets. This gives
   immediately useful aircraft positions with inexpensive radios. The wire-format
   reference is [OpenDroneID core](https://github.com/opendroneid/opendroneid-core-c).
2. Add an explicit local SDR-decoder bridge, starting with owner-operated
   [readsb](https://github.com/wiedehopf/readsb/blob/dev/README-json.md) or an
   authorized MAVLink telemetry receiver. Validate actual timestamps, coordinates
   and unmanned identity before adding points. No aircraft-category shortcut is
   implemented in the Linux node yet.
3. Evaluate legacy DJI DroneID with a supported test aircraft and receiver.
   [DroneSecurity](https://github.com/RUB-SysSec/DroneSecurity), from NDSS 2023,
   documents an OcuSync 2.0 proof-of-concept receiver tested with a USRP B205-mini,
   DJI Mini 2 and Mavic Air 2. Its live capture uses 50 MHz bandwidth and it is not
   optimized for range or poor RF. A HackRF sweep is not a substitute for that
   decoder. Filter any operator/home coordinates out of an eventual integration.
4. Investigate V2X and unmanned maritime telemetry using verified protocol/identity
   data. Require separate decoder tests; ordinary road traffic and crewed vessels
   should not become autonomous-device points.

## SDR measurements we can collect now

The dashboard shows bin frequency, relative power, strongest bin and its difference
from the current median. These are local RF measurements, not calibrated distance,
absolute dBm, bearing or object classification. Hardware gain, antenna and cable
loss change them. Sweeping also misses brief/hopping transmissions and cannot
observe all bands simultaneously.

Presets cover 430–440, 863–870, 902–928, 2400–2485, 5725–5875 and 5850–5925 MHz,
plus 1089–1091 and 161–163 MHz research views. Bands contain many unrelated devices.
HackRF uses its documented [sweep CSV output](https://hackrf.readthedocs.io/en/latest/hackrf_tools.html);
RTL-SDR uses [rtl_power](https://github.com/osmocom/rtl-sdr/blob/master/src/rtl_power.c).
This version rejects upper-band RTL-SDR presets. Hardware choices must match both
frequency and instantaneous bandwidth, not just an advertised antenna range.

A future decoder report should include protocol/version, receiver time, claimed
device time, checksum/authentication result, ID type, model evidence, position basis,
frequency/channel, measurement units and receiver capabilities. Keep unsupported
fields unknown. A stable ID may help associate reports; MAC randomization and
unverified/spoofed broadcasts prevent guaranteed identity tracking. RSSI alone does
not establish a compass direction.

## MQTT finding

The inspected local Dedrone metrics contained incoming-queue, publish/send and
subscribe/unsubscribe counters. These establish use of MQTT, but provide neither
a public detection subscription nor a usable coordinate schema. No remote broker
in that evidence was contacted. The Linux adapter subscribes only to an explicitly
configured topic and accepts the narrow Remote ID envelope in the
[setup guide](linux-node-setup.md#optional-mqtt-input).

MQTT is standardized publish/subscribe messaging ([MQTT.org](https://mqtt.org/));
the client implementation uses [Eclipse Paho](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html).
Future fleet feeds need field-by-field schema and permission checks, even if their
transport is MQTT.

## Other primary references

- [ArduPilot SiK telemetry radios](https://ardupilot.org/copter/docs/common-sik-telemetry-radio.html): modem/radio context for telemetry.
- [ExpressLRS MAVLink](https://www.expresslrs.org/software/mavlink/): supported telemetry modes and hardware requirements.
- [MAVLink overview](https://mavlink.io/en/about/overview) and [message signing](https://mavlink.io/en/guide/message_signing.html): message framing and authentication are separate from RF demodulation.
- [ETSI Intelligent Transport Systems](https://www.etsi.org/technical-groups/its/): cooperative road-vehicle communications; not an autonomous-vehicle registry.
- [US Coast Guard AIS](https://www.navcen.uscg.gov/automatic-identification-system-overview): maritime identification and position broadcasts.
- [HackRF hardware](https://hackrf.readthedocs.io/en/latest/hackrf_one.html): receiver limits and specifications.

Research references are not live data sources connected to the map. No new public
feed or proprietary-radio decoder is enabled by this document.
