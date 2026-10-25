# DRONEmapper Desktop — Windows, macOS and Linux

Version 0.6.2 · **Church of Malware / saviorSEC**

The same local dashboard, radar, detection list, account pairing and optional
map uploads run on Windows, macOS and Linux. No account password goes into the
node. [Linux setup](linux-node-setup.md) remains available.

## Start the node

Install Python 3.10 or newer from [python.org](https://www.python.org/downloads/)
and extract the source bundle into a folder you can write to.

- **Windows:** double-click `linux-node\Start-DRONEmapper.cmd`. Include the Python
  launcher when installing Python. You can also run `py -3 linux-node\bootstrap.py`.
- **macOS:** in Terminal, change into the extracted folder and run
  `bash linux-node/Start-DRONEmapper.command`. With Homebrew Python, the launcher
  checks both `/opt/homebrew/bin` and `/usr/local/bin`.

The first start installs Bleak, Paho and pySerial into `linux-node/.venv-desktop`, then
opens **http://127.0.0.1:8790/**. Leave the terminal open. Stop with **Ctrl+C**;
restart with the same launcher. After a source update, run the launcher with
`--update` to refresh dependencies. Add `--dji` to install the optional DJI
decoder dependencies. These launchers do not install OS drivers or change Wi-Fi
settings automatically.

For a manual installation, create a Python virtual environment and run
`python -m pip install "./linux-node[all]"`, then `dronemapper-node serve --open`.
Headless operation uses `dronemapper-node run`. Run `dronemapper-node doctor`
for capability details.

## Connect and scan

1. Click **Connect to DRONEmapper**, sign in on the website, and approve the matching code.
2. Choose radios in **Radio settings**, click **Save settings**, then **Start listening**.
3. Enable your preferred reports under **Station location & sharing**. Sharing starts off.

Set your stationary receiver location to place received aircraft GPS on the
radar relative to your station. Signals without coordinates remain strength
contacts. The position range changes the view, not antenna reach.

## External ESP32 / CYD receivers

Plug in a compatible serial receiver, open **USB serial receiver**, choose its port
and format, then **Connect receiver**. Start Remote ID Scan on the board.
Marauder CSV reports appear locally; timestamped raw Remote ID JSON can contribute
fresh positions through your existing sharing choice.
[Serial formats, firmware setup and Linux channel hopping](serial-receivers.md).

## Radio setup

| Input | Windows | macOS |
| --- | --- | --- |
| Bluetooth Remote ID | Choose **System Bluetooth**; native WinRT passive advertisements | Choose **System Bluetooth**; allow Terminal/Python Bluetooth access when macOS asks |
| Wi-Fi beacons / Remote ID / camera-link candidates | Wireshark + Npcap with raw 802.11 support; compatible monitor driver | Wireshark + its ChmodBPF capture-permission setup; compatible monitor driver |
| HackRF spectrum / IQ | Install official HackRF tools and the appropriate USB driver; tools must be on PATH | `brew install hackrf` |
| RTL-SDR spectrum | Install RTL-SDR tools; `rtl_power.exe` must be on PATH | `brew install rtl-sdr` |
| ADS-B | Compatible `readsb` build on PATH, or a local `aircraft.json` from an existing receiver | Same; the node accepts fresh local readsb-format data |
| DJI DroneID | HackRF tools + `--dji` dependencies; capture/decode cycles | Same |
| ESP32 / CYD USB serial | COM port + pySerial; board USB/UART driver if needed | /dev/cu.* port + pySerial; board USB/UART driver if needed |
| MQTT receiver feed | Authorized exact topic and the documented Remote ID envelope | Same |

**Windows SDR tools:** Great Scott Gadgets recommends
[radioconda or its official build artifacts](https://hackrf.readthedocs.io/en/latest/installing_hackrf_software.html).
Launch DRONEmapper from an environment where `hackrf_sweep`, `hackrf_transfer`
and/or `rtl_power` run. When a USB driver needs installing, select only the
intended SDR in the driver installer. A PortaPack must be in HackRF USB mode.
This project does not bundle third-party Windows drivers.

**Wi-Fi:** run `dumpcap -D` and copy the dedicated adapter's name from Receiver
status into the Wi-Fi field. Windows names look like `\Device\NPF_{...}`; macOS
names commonly look like `en0`. The node requests monitor capture with `-I`,
checks available 802.11 link types, and rejects Ethernet-only output. Capture
can disconnect that adapter's network connection; use another interface for
Internet access. OS/driver settings determine the channel. An adapter working
on Linux or Android does not establish Windows/macOS monitor support. The
doctor listing alone is not a reception test.

**Bluetooth:** Windows/macOS select the OS-managed controller. Per-controller
selection remains a Linux feature. macOS CoreBluetooth exposes local device
UUIDs instead of MAC addresses and does not offer passive scanning; the node
uses its discovery API, with no GATT pairing or connections. Local UUIDs are
never sent to the public map. A broadcast Remote ID identity and fresh reported
position are still required for position uploads. Denied macOS access can be
changed in **System Settings → Privacy & Security → Bluetooth**.

Wi-Fi, Bluetooth and one SDR run independently. One SDR runs one mode at a time.
RTL-SDR cannot directly receive 2.4/5 GHz. RF power does not identify a drone;
decoded broadcasts and camera-link candidates retain their existing separate
reporting rules. See [SDR decoders](sdr-decoders.md) for protocol limits.

## Local account data

- Windows: `%LOCALAPPDATA%\DRONEmapper\node` (directory access restricted to your user and SYSTEM).
- macOS: `~/Library/Application Support/DRONEmapper/node` (private user permissions).
- Linux: existing `~/.local/state/dronemapper-node` location is preserved.

The dashboard binds only to loopback. Do not run the whole node as Administrator
or root. Use **Disconnect this computer** to remove its local account credential;
revoke the node on the website to remove server access. Keep MQTT passwords in
environment variables, as described in the [MQTT setup](linux-node-setup.md).

## Validation

The shared suite passes on native Windows, macOS and Linux runners
([verified CI run](https://github.com/ekomsSavior/DRONEmapper/actions/runs/39374036922)).
It covers receiver shutdown, Windows binary-IQ handling and account-directory
permissions, macOS UUID association, monitor-mode checks, account consent and
local dashboard boundaries. Radio inputs in these checks use isolated fixtures.
Native Windows/macOS hardware reception has not been verified yet. Android
HackRF testing is separate and does not establish desktop compatibility.

## References

[Bleak Windows backend](https://bleak.readthedocs.io/en/latest/backends/windows.html) ·
[Bleak macOS backend](https://bleak.readthedocs.io/en/latest/backends/macos.html) ·
[Wireshark Wi-Fi capture](https://wiki.wireshark.org/CaptureSetup/WLAN) ·
[dumpcap options](https://www.wireshark.org/docs/man-pages/dumpcap.html) ·
[HackRF installation](https://hackrf.readthedocs.io/en/latest/installing_hackrf_software.html).

Project and data credits, including the **OUI Master Database**, remain in the
[node README](../linux-node/README.md).

## Local network discovery

Desktop 0.6.0 adds optional passive ARP sender recognition for reviewed Verkada MAC allocations. Choose a LAN interface under Radio settings, save, then start listening. Wireshark/dumpcap capture access is required. This receiver leaves interface mode unchanged, shows matching observations in a separate local list and never uploads them. No physical CM42 reception has been verified. [Full setup, research and limits](security-device-discovery.md).

Desktop 0.6.2 adds an independent **Listen for Carbyne, Fusus and Dedrone domain lookups** option in that same panel. Matches appear in **Local service activity**, with time, interface and a platform link. Website visits can match; these observations stay local and do not identify a drone, camera or dispatch installation. [Carbyne setup and integration research](carbyne-discovery.md).

[Axon Air / Fusus model references and local domain hints](axon-air-fusus.md).
