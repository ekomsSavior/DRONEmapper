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

**Updating to 0.8.2:** download the new APK from the same page and install it over
your existing app—no uninstall. Pairing and settings are preserved. In **Phone
capabilities**, check the version. USB Wi-Fi: **USB Wi-Fi adapter → Connect → Allow**.
HackRF: **USB SDR · HackRF → Choose receiver → Connect → Allow** for local RF spectrum.
Updates are manual; re-enable your preferred **Sharing choices** after starting.

## Desktop scanner node

Windows, macOS and Linux computers can run the [standalone node and radar](linux-node/README.md).
[Download Desktop 0.6.0 and follow your system's setup](https://dronemapper.churchofmalware.org/desktop).
Pair with your account and choose which detections to share. Wi-Fi, Bluetooth, one SDR and an external USB serial receiver can run together.
[ESP32 / Marauder receivers and optional Linux channel hopping](docs/serial-receivers.md).

- **Windows:** install Python 3.10+, extract the source, then open `linux-node/Start-DRONEmapper.cmd`.
- **macOS:** install Python 3.10+, then run `bash linux-node/Start-DRONEmapper.command`.
- **Linux:** follow the [monitor-adapter setup](docs/linux-node-setup.md).

[Windows/macOS receiver setup](docs/desktop-node-setup.md) · [SDR decoders](docs/sdr-decoders.md).
Wi-Fi capture depends on the OS driver and monitor-mode support. SDR spectrum displays RF activity; the separate decoders extract supported protocols.

## Wardrive logs

In [your account](https://dronemapper.churchofmalware.org/account.html), open
**Wardrive logs** to import WiGLE CSV exports or create a token
for automatic completed-export uploads. Matching camera-link signals keep their
original dates and appear as approximate areas. [Setup and API guide](docs/wardrive-uploads.md).

Android **Saved wardrives** records offline, keeps trips after stopping, and lets
you upload at home or export WiGLE CSV. [App instructions](android-node/README.md#record-offline-upload-at-home).

## Run locally

Python 3.10+ and an internet connection. No extra packages, API keys or receivers.

```sh
git clone https://github.com/ekomsSavior/DRONEmapper.git
cd DRONEmapper
python3 server.py
```

Open **http://127.0.0.1:8780**. Allow a moment for the first collection. Most data refreshes every five minutes while the server runs; police flight feeds follow their configured 5–60 minute check schedules. Stop with `Ctrl+C`. On Windows, use `py -3 server.py`.

Map visitors need only a browser. Scanner reports add Remote ID positions and optional approximate Wi-Fi or supported robot signal areas. Observed items keep a profile and become ghosts after 14 days without another sighting.

## Where the data comes from

- [DEPLOY](https://registry.deploy.report/map): documented drone and robot deployments.
- [AV Map](https://github.com/path-avmap/av-map-data): driverless service areas and dated ended services.
- [ADSB.lol](https://www.adsb.lol/docs/open-data/api/): identified unmanned aircraft positions.
- [NOAA](https://www.pmel.noaa.gov/usv-hurricane/): uncrewed ocean vehicle measurements.
- Agency flight dashboards: published takeoff/landing times, purposes and generalized flight areas. [Coverage and official portals](https://dronemapper.churchofmalware.org/police-flights.html). Agency data retains separate terms from the software.
- [San Francisco / SFPD](https://data.sf.gov/d/giw5-ttjs): dated police flight logs and generalized operation areas (PDDL 1.0), checked hourly. [Official flight portals](https://dronemapper.churchofmalware.org/police-flights.html).
- [EFF Atlas](https://www.atlasofsurveillance.org/atlas): documented public-safety drone programs.
- [International Argo Program / Argo GDAC](https://doi.org/10.17882/42182): quality-checked autonomous profiling-float surface fixes; unrestricted data use with attribution requested.
- [IOOS Glider DAC](https://gliders.ioos.us/): quality-checked Spray underwater-glider surface GPS fixes from Scripps and WHOI.
- [NOAA CoastWatch](https://cwcgom.aoml.noaa.gov/erddap/tabledap/GLIDERS_LAST_10_DAYS_LOCATIONS.html): reported underwater glider locations.
- [ClimateViewer](https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/): historical UAV records.
- [OUI Master Database](https://github.com/Ringmast4r/OUI-Master-Database) by **Ringmast4r**, using IEEE registry entries: offline MAC-prefix/radio-vendor lookup in the Android and desktop apps.

Coverage varies. Deployment areas and historical records are labeled separately from timestamped positions; this is not universal live tracking.

Website: **[AGPL-3.0-or-later](LICENSE)**. Android app: **[GPL-2.0-only](android-node/LICENSE)**. Third-party data keeps its own licenses. [Data details](docs/data-methods.txt) · [Advanced setup](docs/setup.md).

<img width="624" height="341" alt="Screenshot_20261015_230856" src="https://github.com/user-attachments/assets/283dcdc7-a222-4e89-aad2-925b777a795b" />

Model recognition now covers 141 reviewed FAA aircraft/module combinations. Historical map enrichment adds 40 dated operational milestones. [Review notes](https://github.com/ekomsSavior/DRONEmapper/blob/main/docs/research-enrichment.md).

[Vehicle data, recurring feeds and HackRF connection notes](docs/source-reception-review.md).

[Local security-device discovery and hardware references](docs/security-device-discovery.md).

[Robot signal support and sharing](docs/robot-signals.md) · [Latest research review](docs/community-enrichment.md).
