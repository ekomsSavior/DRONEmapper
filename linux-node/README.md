# DRONEmapper desktop node

Turn a Windows, macOS or Linux computer into a scanner node with a local radar, live detections and optional uploads to [DRONEmapper](https://dronemapper.churchofmalware.org/). Built by **Church of Malware** and **saviorSEC**, the Church’s research branch.

## Start

[Download Desktop 0.3.1 for Windows, macOS or Linux](https://dronemapper.churchofmalware.org/desktop).

**Windows:** install [Python 3.10+](https://www.python.org/downloads/windows/), extract the source, then double-click `Start-DRONEmapper.cmd` in this folder.

**macOS:** install [Python 3.10+](https://www.python.org/downloads/macos/), then run `bash linux-node/Start-DRONEmapper.command` from the extracted bundle/repository root.

Both launchers install dependencies in a local environment and open the radar. Leave the terminal running; `Ctrl+C` stops it. Run the launcher again to restart. [Windows/macOS radio setup](../docs/desktop-node-setup.md).

**Linux:**

Download the [Desktop bundle](https://dronemapper.churchofmalware.org/desktop),
or use this repository. Debian/Ubuntu users with a spare USB Wi-Fi adapter can run
`bash linux-node/setup-debian.sh YOUR_DEDICATED_USB_INTERFACE` from the extracted
bundle/repository root. It requests sudo and sets up monitor mode.

Python 3.10+ on Linux. From the repository root:

```sh
python3 -m venv .venv-node
. .venv-node/bin/activate
pip install './linux-node[all]'
dronemapper-node serve
```

Open **http://127.0.0.1:8790/**. Choose receivers, **Save settings**, then **Start listening**. The dashboard also runs without optional packages: `python3 linux-node/launch.py serve`.

To contribute, click **Connect to DRONEmapper**, approve the matching code in your account, then enable the reports you want under **Station location & sharing**. Sharing starts off. Your account password stays in the website.

- **Wi-Fi:** dedicated monitor interface and `dumpcap`; receives Remote ID beacons/NAN and possible WiFi CAM/Tello camera links. Uses OS capture drivers, not the Android USB driver list. Windows needs Npcap; macOS needs Wireshark capture permissions.
- **Bluetooth:** Remote ID advertisements through Bleak. Choose **System Bluetooth** on Windows/macOS, or an `hci` controller on Linux. macOS uses CoreBluetooth discovery and local UUIDs rather than radio MACs.
- **SDR:** HackRF/RTL-SDR spectrum or live ADS-B decoding with readsb. Ordinary aircraft stay local; broadcasts reporting UAS category have a separate sharing choice.
- **DJI DroneID:** automatic HackRF capture/decode cycles on a selected channel, plus separate recording review. Live DJI reception still needs a supported-aircraft test; manually reviewed recordings are never uploaded.
- **MQTT:** optional authorized receiver feed using the documented Remote ID envelope.

Wi-Fi, Bluetooth and one SDR run together. On Linux, if BlueZ reports that experimental
support is required, `bash linux-node/enable-passive-ble.sh` backs up its configuration,
enables passive reception support and briefly restarts Bluetooth.

The radar uses reported GPS for direction/distance. In **Positions**, choose a range from **100 m to 500 km**; your choice is remembered in this browser. The signal view shows strength; its dot angles are only layout. Antennas must match the receiver and frequency; a larger antenna alone does not decode additional protocols.

**[Install and use SDR decoders](../docs/sdr-decoders.md)** · **[Receiver setup, headless mode and MQTT](../docs/linux-node-setup.md)** · **[SDR research and next decoders](../docs/sdr-discovery-research.md)**

## Credits

[Church of Malware](https://churchofmalware.org/) · [saviorSEC](https://churchofmalware.org/work/) · [OpenDroneID protocol references](https://github.com/opendroneid/opendroneid-core-c) · [FAA declarations](https://uasdoc.faa.gov/listDocs) · [OUI Master Database by Ringmast4r](https://github.com/Ringmast4r/OUI-Master-Database), using IEEE registry entries · [readsb](https://github.com/wiedehopf/readsb) · [DroneSecurity / RUB-SysSec](https://github.com/RUB-SysSec/DroneSecurity) · [Bleak](https://github.com/hbldh/bleak) · [Eclipse Paho](https://github.com/eclipse-paho/paho.mqtt.python) · [Wireshark](https://www.wireshark.org/) · [HackRF](https://greatscottgadgets.com/hackrf/) · [Osmocom RTL-SDR](https://osmocom.org/projects/rtl-sdr/wiki).

Code: **AGPL-3.0-or-later**. Data and optional dependencies retain their own terms; see [NOTICE](NOTICE.txt). Hardware validation is tracked in the setup guide.

Model recognition now covers 106 reviewed FAA aircraft/module combinations. Historical map enrichment adds 12 dated operational milestones. [Review notes](https://github.com/ekomsSavior/DRONEmapper/blob/main/docs/research-enrichment.md).
