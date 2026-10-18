# DRONE MAPPER

A free, open-source map of drones, robots and autonomous vehicles. Built by **[Church of Malware](https://churchofmalware.org/)** and **[saviorSEC](https://churchofmalware.org/work/), the Church’s research branch**.

**[Open the map](https://dronemapper.churchofmalware.org/)** · [GitHub](https://github.com/ekomsSavior/DRONEmapper) · [Gitea](https://git.churchofmalware.org/ek0mssavi0r/DRONEmapper)

<img width="982" height="964" alt="Screenshot_20261015_220619" src="https://github.com/user-attachments/assets/360dc6dc-3d93-4912-b674-b6dcc396375a" />


## Android app

Android 8 or newer. No root or Bluetooth dongle needed.

1. [Download the app](https://dronemapper.churchofmalware.org/nodes.html) and install the APK. Allow installation from your browser when Android asks.
2. Enable Bluetooth, Wi-Fi and Location, grant the requested permissions, then tap **Start listening**.
3. To share sightings, tap **Connect to DRONEmapper** → **Continue in browser**. Create an account, verify your email, sign in and approve the matching phone code.
4. Return to **Sharing choices**, enable the reports you want to share and tap **Save**. **Open world map** opens the website.

Sharing is optional. Choose a display name or remain **Anonymous**; email and full MAC addresses stay off the public map. [More app instructions and build steps](android-node/README.md).

**Updating to 0.5.1:** download the new APK from the same page and install it over
your existing app—no uninstall. Pairing and settings are preserved. In **Phone
capabilities**, check the version. USB users: **USB Wi-Fi adapter → Connect → Allow**.
Updates are manual; re-enable your preferred **Sharing choices** after starting.

## Linux scanner node

Stationary computers can use a [Linux CLI and local radar dashboard](linux-node/README.md),
with dedicated monitor Wi-Fi, passive Bluetooth, optional MQTT input and HackRF/RTL-SDR
spectrum views. Linux 0.2.0 adds [ADS-B and DJI protocol decoders](docs/sdr-decoders.md). Pair it with your account and choose what to share. SDR power is
unclassified RF activity; it does not yet identify drones. [Setup and hardware notes](docs/linux-node-setup.md).

[Download Linux 0.2.0 and follow the quick start](https://dronemapper.churchofmalware.org/linux.html).
Wi-Fi, Bluetooth and one SDR can run together. Debian/Ubuntu setup configures a
spare USB adapter in monitor mode; the optional Bluetooth helper enables passive
BlueZ reception. Your existing account works with both Android and Linux nodes.

## Run locally

Python 3.10+ and an internet connection. No extra packages, API keys or receivers.

```sh
git clone https://github.com/ekomsSavior/DRONEmapper.git
cd DRONEmapper
python3 server.py
```

Open **http://127.0.0.1:8780**. Allow a moment for the first collection. Data refreshes every five minutes while the server runs. Stop with `Ctrl+C`. On Windows, use `py -3 server.py`.

Map visitors need only a browser. Scanner reports add Remote ID positions and optional approximate Wi-Fi signal areas. Observed items keep a profile and become ghosts after 14 days without another sighting.

## Where the data comes from

- [DEPLOY](https://registry.deploy.report/map): documented drone and robot deployments.
- [ADSB.lol](https://www.adsb.lol/docs/open-data/api/): identified unmanned aircraft positions.
- [NOAA](https://www.pmel.noaa.gov/usv-hurricane/): uncrewed ocean vehicle measurements.
- [EFF Atlas](https://www.atlasofsurveillance.org/atlas): documented public-safety drone programs.
- [International Argo Program / Argo GDAC](https://doi.org/10.17882/42182): quality-checked autonomous profiling-float surface fixes; unrestricted data use with attribution requested.
- [IOOS Glider DAC](https://gliders.ioos.us/): quality-checked Spray underwater-glider surface GPS fixes from Scripps and WHOI.
- [NOAA CoastWatch](https://cwcgom.aoml.noaa.gov/erddap/tabledap/GLIDERS_LAST_10_DAYS_LOCATIONS.html): reported underwater glider locations.
- [ClimateViewer](https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/): historical UAV records.
- [OUI Master Database](https://github.com/Ringmast4r/OUI-Master-Database) by **Ringmast4r**, using IEEE registry entries: offline MAC-prefix/radio-vendor lookup in the Android and Linux apps.

Coverage varies. Deployment areas and historical records are labeled separately from timestamped positions; this is not universal live tracking.

Website: **[AGPL-3.0-or-later](LICENSE)**. Android app: **[GPL-2.0-only](android-node/LICENSE)**. Third-party data keeps its own licenses. [Data details](docs/data-methods.txt) · [Advanced setup](docs/setup.md).

<img width="624" height="341" alt="Screenshot_20261015_230856" src="https://github.com/user-attachments/assets/283dcdc7-a222-4e89-aad2-925b777a795b" />
