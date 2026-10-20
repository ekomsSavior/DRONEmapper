# SDR protocol decoders

DRONEmapper Desktop 0.3.0 · **Church of Malware / saviorSEC**

Windows, macOS and Linux share the decoder integrations. Use the
[desktop receiver guide](desktop-node-setup.md) for Windows/macOS dependencies;
the installer below is for Debian/Ubuntu. Native Windows/macOS radio reception
still needs hardware testing.

## Install and start

From the repository or Linux source bundle, on Debian/Ubuntu:

```sh
bash linux-node/install-decoders-debian.sh
bash linux-node/run-local.sh
```

The installer builds a pinned [readsb](https://github.com/wiedehopf/readsb) revision
with **HackRF and RTL-SDR** support, and installs the Python DJI decoding extra.
It requests sudo for build packages. It does not change Bluetooth, Wi-Fi, sharing,
or services. Restart an already-running node to load this version.

Other distributions can install readsb with the appropriate receiver support and
use `pip install './linux-node[all,dji]'` in a virtual environment. The default
`[all]` extra still covers only the lightweight BLE/MQTT adapters; `[dji]` adds
NumPy, SciPy, Matplotlib and bitarray. Matplotlib uses a noninteractive backend.

## Live ADS-B

In the dashboard, stop listening, choose **HackRF** or **RTL-SDR**, set **SDR mode →
ADS-B**, save and start. A PortaPack must be in HackRF USB mode. The node starts
readsb at **1090 MHz** with CRC correction disabled and no network feeds/ports.
It owns and stops that receiver process. One SDR cannot sweep the spectrum and
decode ADS-B simultaneously; Wi-Fi and Bluetooth run independently.

An existing receiver can be used instead: set **Existing ADS-B receiver** to its
local `aircraft.json`, such as `/run/readsb/aircraft.json`. Do not select a second
managed ADS-B process for the same device. An existing file input can accompany
spectrum reception from a separate SDR.

Decoded aircraft appear in the live list. **Positions** uses fresh aircraft GPS
relative to your station location. RSSI reported by readsb is **dBFS**, not dBm or
an estimated distance. The signal-view dot angles are layout only.

Ordinary aircraft stay local. Only broadcasts reporting **UAS emitter category
B6** are eligible for the separate, initially-off **Share decoded drone positions** choice. This is a transmitter's claim, not authenticated autonomy
or manufacturer identity. Military flags, callsigns and autopilot status are not
used to infer a drone. The matching website update is required to accept
`adsb-uas` reports; older servers reject these without affecting Wi-Fi/BLE inputs.

Only direct `adsb_icao` positions with fresh `seen` / `seen_pos` timestamps are
accepted. MLAT, TIS-B, receiver-derived coordinates, stale files and missing GPS
are excluded. Reports keep their original observation time. The website hashes
ICAO addresses into a protocol-specific track identity and never interprets these
records as ASTM Remote ID. Disabling sharing cancels queued ADS-B reports.

## DJI DroneID capture and decoding

The bundled receive-only demodulator is derived from
[RUB-SysSec/DroneSecurity](https://github.com/RUB-SysSec/DroneSecurity), revision
`9ff819843bee48fb140a0704ec78aff757896dea` (AGPL-3.0). It decodes the researched
OcuSync 2.0 DroneID waveform, not every DJI radio generation or every drone.
Upstream was tested with a USRP, Mini 2 and Mavic Air 2.

For automatic local reception, choose **HackRF → DJI DroneID · capture / decode**
and a **DJI channel**, save, then start. It captures 0.5 seconds at 20 Msps and
processes that capture in an isolated worker, repeatedly. There are reception gaps
while processing; this is not continuous coverage or automatic channel hopping.
Wi-Fi and Bluetooth keep running. Only CRC-valid, identified aircraft with GPS
and device timestamps within five seconds of the capture are emitted as live
contacts. Captures taking more than a minute to process cannot produce live data.

Fresh positions can use the separate **Share decoded drone positions** consent.
DJI reports have their own protocol and track IDs, never fabricated ASTM IDs.
Temporary IQ is deleted after each cycle; operator/home coordinates never enter
reports. A supported DJI aircraft is still needed to verify this path over the air.

To record and inspect a capture manually, first stop the SDR receiver:

```sh
dronemapper-node capture-iq --frequency-mhz 2444.5 --seconds 1 --output capture.cs8
dronemapper-node decode-dji capture.cs8 --format cs8 --sample-rate 20000000 --output review.json
```

2444.5 MHz is one published research channel, not a guaranteed channel for a
particular aircraft. A fixed-frequency capture can miss hopping bursts. The
capture command is receive-only, uses 20 Msps, creates a private file, refuses to
overwrite files and limits a recording to three seconds. A one-second capture is
about 40 MB. USB permission or a busy receiver must be resolved in your normal
terminal. No radio firmware is changed.

For existing complex float32 IQ recordings, use `--format cf32` and their actual
sample rate (15.36–50 Msps). `--skip-detection` is only for an isolated burst of at
most 20 ms. Input is capped at 512 MiB; decoding is CPU intensive. Retune/recenter
before reducing bandwidth: simply downsampling a wide capture can discard the
DroneID burst entirely.

Open `review.json` under **DJI recording review** in the dashboard. The review
shows CRC-valid aircraft fields, reported time, model code/name when known, and
aircraft coordinates when present. **Manually opened recordings never enter the live radar,
upload queue or public map.** A valid checksum is not identity authentication.
Unknown serials/models remain unknown. Pilot/home coordinates are never parsed
into a report; uncertain altitude/velocity scaling is omitted. Raw IQ itself may
contain additional broadcasts, so keep your recordings private.

The demodulation chain detects candidate bursts, finds synchronization sequences,
corrects frequency/phase, demodulates OFDM/QPSK, descrambles and reconstructs the
payload, then checks its CRC. It does not decrypt or connect to a drone, inject
packets, operate a controller, or publish spectrum peaks as drone locations.

## Verification, 18 October 2026

- Published Mavic Air 2 recording: one CRC-valid packet; two candidates rejected.
- Published Mini 2 recording: seven CRC-valid packets; three candidates rejected.
  Missing/redacted serial identity is kept unknown.
- Real Mavic Air 2 recording recentered, resampled to **20 Msps** and quantized to
  **signed 8-bit IQ**: one CRC-valid packet. This checks format/bandwidth handling;
  it is not a live HackRF reception test.
- readsb compiled locally with both HackRF and RTL-SDR backends. A 90-second host-terminal test successfully opened HackRF and ran readsb,
  but received no fresh aircraft positions. This verifies receiver startup, not
  over-the-air decoding performance. Physical RTL-SDR reception is untested.
- Parser, consent, queue, server validation and isolated upload/projection tests
  run without contacting the public map. No recordings or test points ship in
  the downloadable bundle.

Continuous IQ processing, channel hopping and other protocol families remain
separate work. This release provides live ADS-B integration, cyclic DJI capture /
decode and a separate recording-review workflow, not universal SDR identification.

## References and credits

- [readsb JSON format](https://github.com/wiedehopf/readsb/blob/dev/README-json.md)
- [readsb HackRF backend](https://github.com/wiedehopf/readsb/blob/dev/sdr_hackrf.c)
- [DroneSecurity](https://github.com/RUB-SysSec/DroneSecurity) / RUB System Security and CISPA, NDSS 2023
- [proto17 DJI RF analysis](https://github.com/proto17/dji_droneid), research channel/bandwidth reference
- [HackRF tools](https://hackrf.readthedocs.io/en/latest/hackrf_tools.html)

See the bundled decoder `LICENSE` and `NOTICE.txt` for original file hashes and
local compatibility changes. readsb is installed separately and retains its own
license. Spectrum, Bluetooth, Wi-Fi, MQTT, account pairing and opt-in area sharing
continue to use the existing [node setup](linux-node-setup.md).
