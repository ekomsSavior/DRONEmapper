# Stationary Linux scanner

The Linux node provides a CLI and a browser dashboard at `127.0.0.1:8790`.
Install from [linux-node/README.md](../linux-node/README.md). It runs as your normal
user. The public map still works for visitors without any receiver.

## What this version receives

| Input | Output | Requirements |
|---|---|---|
| Monitor Wi-Fi | ASTM/OpenDroneID v2 Basic ID + aircraft Location; Wi-Fi beacon and NAN publish transports | Linux-supported adapter, monitor interface, non-root dumpcap capture |
| Passive Bluetooth | ASTM/OpenDroneID v2 Basic ID + aircraft Location | BlueZ Advertisement Monitor support, compatible controller, Bleak 3.0.2+ |
| Camera-link beacon names | Possible WiFi CAM / Tello signal, local MAC and radio vendor | Matching beacon; not proof of device type or GPS |
| HackRF / RTL-SDR | Frequency bins, relative power, strongest bin | Installed receive tools and USB access; no drone classification |
| MQTT | Same validated Remote ID messages through a configured broker | Explicit topic authorization and the envelope below |

No raw packets, operator locations or camera/video content are stored. Unsupported
protocol versions, malformed packets and stale locations are dropped. China
GB 46750-2025, legacy DJI DroneID and arbitrary robot fleet protocols are not
decoded in this version. No transmission, injection or camera connection is used.

## Wi-Fi adapters and external antennas

For Debian/Ubuntu, an optional host setup script installs the receive tools and
Python environment, grants your user Wireshark capture access, creates `dmmon0`
on a specified **unassociated USB adapter**, and launches the dashboard with
Wi-Fi channel 6 plus HackRF 2.4 GHz spectrum. It requests sudo in your terminal:

```sh
bash linux-node/setup-debian.sh YOUR_DEDICATED_USB_INTERFACE
```

It disables NetworkManager management only for that dedicated adapter. It refuses
an associated adapter; if the same radio already has `dmmon0` configured as a monitor,
it resumes the scanner instead of reinstalling. It refuses an unrelated `dmmon0`.
Read the script first if you manage
your own capture permissions. It does not enable sharing or pair an account.
Restore adapter management afterward with
`sudo nmcli device set YOUR_DEDICATED_USB_INTERFACE managed yes` and remove the
monitor interface as shown below. Setup requires a Debian-family host and Internet.
After setup, `bash linux-node/run-local.sh` starts the current checkout with the
installed dependencies and saved settings. Stop an existing instance with Ctrl+C
first. This is useful while testing local code updates; it does not rerun setup.

Use a **dedicated adapter**, separate from the computer's Internet connection.
Linux kernel/firmware support determines compatibility. The Android app's USB
compatibility table does not certify a Linux adapter. Check `dronemapper-node doctor`
and `iw list`; an adapter must actually capture monitor frames before it is considered
working. Model revisions can contain different chipsets.

On Debian/Ubuntu, install the tools and enable your distribution's non-root
Wireshark capture setup:

```sh
sudo apt install iw wireshark-common
sudo dpkg-reconfigure wireshark-common
sudo usermod -aG wireshark "$USER"
```

Choose non-root capture in the configuration dialog, then log out/in to activate
the group. [Wireshark capture privileges](https://wiki.wireshark.org/CaptureSetup/CapturePrivileges)
explain the security scope. Do not run the entire dashboard as root.

Find your **dedicated** adapter's PHY in `iw dev`; substitute it for `phy1`:

```sh
sudo iw phy phy1 interface add dmmon0 type monitor
sudo ip link set dmmon0 up
sudo iw dev dmmon0 set channel 6
dronemapper-node configure --wifi dmmon0
dronemapper-node serve --listen
```

Use `dmmon0` in the dashboard. A second dedicated adapter can watch channel 149
where the hardware and regulatory configuration permit it. Up to four dedicated
interfaces can listen simultaneously. Keep a radio fixed, or optionally run
`sudo python3 linux-node/channel-hop.py --interface dmmon0` in a separate terminal.
The Linux helper checks channel availability and other active interfaces on the
same radio, prioritizes channel 6, and restores the original channel on exit.
[Channel plans and ESP32/CYD serial receivers](serial-receivers.md). Never choose
the PHY used for your Internet connection. Linux monitor setup reference:
[iw documentation](https://wireless.docs.kernel.org/en/latest/en/users/documentation/iw.html).

Remove the created interface when finished: `sudo iw dev dmmon0 del`.
Monitor interfaces may need recreating after reboot. Antenna gain, frequency
matching, line of sight and cable loss matter; high gain may narrow the view.
Antenna size does not provide bearing or identify a protocol.

## Bluetooth and SDR

Linux 0.2.0 also supports readsb ADS-B decoding and DJI recording review. See
[SDR protocol decoders](sdr-decoders.md) for installation, privacy, sharing and
validation details. The spectrum setup below remains available.

Select `hci0` (or your controller) in the dashboard. The BLE receiver requests
**passive** Advertisement Monitor reception and does not silently switch to active
scanning. An unsupported BlueZ/controller combination appears in Receiver status.
Extended/Coded PHY reception requires a hardware test; adapter existence is not
proof. [Bleak Linux backend](https://bleak.readthedocs.io/en/latest/backends/linux.html).

If Bleak reports that experimental support is required, run this optional helper
from the repository or extracted Linux bundle:

```sh
bash linux-node/enable-passive-ble.sh
```

It requests sudo, saves a dated backup of `/etc/bluetooth/main.conf`, sets
`Experimental = true` under `[General]`, and restarts Bluetooth. Paired Bluetooth
devices may briefly disconnect. It prints the command to restore the backup.
The node retries automatically within 15 seconds. This enables the D-Bus API,
not experimental kernel features. See [BlueZ's configuration](https://github.com/bluez/bluez/blob/5.72/src/main.conf)
and [Advertisement Monitor API](https://bluez.readthedocs.io/en/latest/advertisement-monitor-api/).
Select the external controller (for example, `hci1`) in Radio settings. Wi-Fi and
SDR continue independently if Bluetooth is unavailable.

For SDR, install `hackrf` or `rtl-sdr` using your Linux package manager and the
package's USB/udev rules, then select the receiver and band. HackRF sweeps start
with RX amplifier and antenna power disabled, LNA gain 16 dB and VGA gain 20 dB.
RTL-SDR bands above 1766 MHz are rejected. Gain is fixed in this first version.
The app starts only receive tools and terminates its child processes on stop.
HackRF can round the requested sweep to hardware boundaries. The plot labels the
actual returned frequencies; the 2400–2485 MHz preset produced bins through
2500 MHz on the tested PortaPack.

For a PortaPack running Mayhem, select **HackRF** on its main menu and confirm the
mode switch; some vendor menus abbreviate this to **RF** with a USB symbol.
Confirm that the dialog describes HackRF functionality before accepting. The
screen controls become inactive while the computer controls it; RESET returns to
Mayhem. No firmware flash is required. [Mayhem's HackRF-mode guide](https://github.com/portapack-mayhem/mayhem-firmware/wiki/HackRF).

The spectrum is **local unclassified RF power**. A busy 915 MHz or 2.4 GHz band is
not a drone detection. See [research](sdr-discovery-research.md) for actual decoder
requirements beyond Wi-Fi/Bluetooth.

## Account, location and sharing

1. Click **Connect to DRONEmapper → Continue in browser**.
2. Sign in or create/verify an account, then approve the matching code.
3. Return to the local dashboard and choose **Share fresh Remote ID positions**
   and/or **Share approximate camera-link areas**, then **Save settings**.

The connection uses the existing website's proof-key device flow. The node stores
its own credential, not your website password. It uses the same authenticated
observation API as Android; no production backend migration is needed.

Station coordinates are optional for Remote ID uploads. Set them for GPS-relative
radar positions or camera-link area sharing. Exact station coordinates remain local;
area reports use the center of a **0.01° grid cell**. This is an approximate receiver
area, not the object position, and is not a guarantee of anonymity. Full radio MACs
and network names remain local. A locally administered MAC has no reliable OUI
manufacturer attribution.

The **Positions** radar uses aircraft-broadcast GPS and true north. The **Signals**
view uses measured strength; dot angles are layout only, not direction. Dots are
clickable and panels collapse. Contacts disappear locally after two minutes without
a fresh observation. The website applies its existing history/ghost rules.

Sharing starts off. Enabling sharing affects new observations, not old local records.
Disabling it cancels queued uploads of that type; it cannot retract a request already
in flight. Offline reports are saved but stop retrying after 12.5 minutes so stale
positions are never uploaded as fresh. The private SQLite history is capped at 10,000
records. Successful retries reuse the original event IDs for server deduplication.
MACs/SSIDs are not written to this history. CLI live output does contain local MACs;
consider that before retaining terminal logs.

State defaults to `~/.local/state/dronemapper-node` (`XDG_STATE_HOME` supported).
Directory permissions are 700 and settings/database permissions 600. Keep this
directory private; it contains the node credential. Only one process may use a
state directory. The dashboard binds to loopback and checks Host, Origin and CSRF;
do not expose it through a public proxy.

Disconnect removes the local credential and cancels sharing. Use **Manage account**
on the website for server-side node revocation and report removal.

## Headless / stationary operation

```sh
dronemapper-node doctor
dronemapper-node configure --ble hci0 --label 'Roof node'
dronemapper-node pair
dronemapper-node configure --share-rid
dronemapper-node run
```

`run` prints detections as JSON lines and receiver status to stderr. `serve --listen`
starts the same receivers with the dashboard. Press Ctrl+C to stop. Pass
`--data-dir /private/path` **before** the command to choose separate state.

An optional [systemd user-service template](../linux-node/dronemapper-node.service)
runs `serve --listen`. Adjust its executable path before installing; it is not
installed or enabled automatically. Configure and pair interactively first.
Bluetooth/monitor-interface availability and dumpcap permissions still apply.
For a remote computer, use SSH forwarding: `ssh -L 8790:127.0.0.1:8790 your-host`.

## Optional MQTT input

MQTT is an IP message transport, not a radio demodulator. Use a broker and **one
exact topic** your receiver publishes and you are authorized to subscribe to.
This app does not discover brokers or access the hosts in the Dedrone evidence.
Dedrone metric names such as `mqtt_incoming_queue_size` and
`mqtt_publish_message_total` are traffic/queue measurements, not aircraft coordinates.

Create a private JSON configuration, substituting your own host/topic:

```json
{
  "host": "YOUR-BROKER-HOST",
  "port": 8883,
  "tls": true,
  "topic": "YOUR-EXACT-RECEIVER-TOPIC",
  "username": "YOUR-SUBSCRIBER-USER",
  "password_env": "DRONEMAPPER_MQTT_PASSWORD"
}
```

Run `chmod 600 /path/to/mqtt.json`. Set the named environment variable securely
before launch (never paste a broker secret into a shared report). Anonymous
authorized brokers can omit username/password_env. `ca_file` can point to your
private CA certificate; certificate verification is never disabled. Plain MQTT is
limited to loopback. Topics cannot contain `+` or `#` wildcards.

Choose the file in the dashboard or use `configure --mqtt-file /path/to/mqtt.json`.
The publisher must send a JSON object with these fields:

| Field | Meaning |
|---|---|
| `schema_version` | Integer `1` |
| `protocol` | `ble`, `wifi-beacon`, or `wifi-aware` |
| `mac` | Observed unicast radio MAC; stays local |
| `payload_hex` | ASTM protocol-v2 25-byte message or message pack, as hex; transport/application counter removed |
| `received_at` | Receiver Unix timestamp in seconds, no older than 120 seconds |
| `rssi_dbm` | Optional measured RSSI, -127 through 20 |

Other fields are rejected. Publish **without retain**. Retained and oversized
messages are discarded. Receiver and broker clocks must be synchronized. The
subscription does not publish MQTT messages. Existing vendor JSON needs an explicit,
documented adapter; arbitrary MQTT payloads are not treated as drone reports.

## Validation

Offline tests use isolated synthetic wire fixtures; they never upload to the map:

```sh
python3 -m unittest discover -s linux-node/tests -v
node --test tests/linux-radar.test.mjs tests/linux-contract.test.mjs
```

Tests cover packet bounds/timestamps, identity association, consent and retry,
private state, MQTT validation, loopback HTTP protections, radar placement and the
production server's record validator. A passing software test is not a reception
or range test. Android Panda reception does not certify this Linux build.

### Linux hardware check — 2026-10-17

| Component | Observed result |
|---|---|
| Panda RT5572 (`148f:5572`, `rt2800usb`) | More than 13,000 real monitor frames on channel 6 through `dmmon0`; the computer's Internet radio remained separate. |
| Powered WiFi CAM toy drone | Matching camera-link beacon appeared in the live list and as a clickable amber dot inside the Signals circle. This was a possible camera-link detection, without broadcast aircraft GPS. |
| PortaPack / HackRF (`1d50:6089`) | Received 1,020 live spectrum bins after entering HackRF USB mode; observed range approximately 2400–2500 MHz. This verifies spectrum reception, not drone identification. |
| Account connection | Browser approval paired the Linux node; sharing remained off. No production observation upload was exercised in this check. |
| Remote ID | No real Remote ID messages received during this check; decoder and upload validation used isolated offline fixtures. |
| Passive BLE | Panda-branded USB adapter enumerated as `7392:c611` (Edimax), `hci1`, on BlueZ 5.72. After enabling the experimental D-Bus API, a separate passive diagnostic counted 123 ordinary advertisement updates in 15 seconds while Wi-Fi and HackRF continued. It stored no device data and uploaded nothing. The production Remote ID listener also started successfully; no real BLE Remote ID was received. |
| RTL-SDR | Software integration and frequency limits checked; physical RTL-SDR reception not yet tested. |

These are single-host reception checks, not range or cross-device certifications.
