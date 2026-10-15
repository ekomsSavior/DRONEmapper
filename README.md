# DRONE MAPPER

A free, open-source map of drones, robots and autonomous vehicles. Built by **[Church of Malware](https://churchofmalware.org/)** and **[saviorSEC](https://churchofmalware.org/work/), the Church’s research branch**.

**[Open the map](https://dronemapper.churchofmalware.org/)** · [GitHub](https://github.com/ekomsSavior/DRONEmapper) · [Gitea](https://git.churchofmalware.org/ek0mssavi0r/DRONEmapper)

## Run locally

Python 3.10+ and an internet connection. No extra packages, API keys or receivers.

```sh
git clone https://github.com/ekomsSavior/DRONEmapper.git
cd DRONEmapper
python3 server.py
```

Open **http://127.0.0.1:8780**. Allow a moment for the first collection. Data refreshes every five minutes while the server runs. Stop with `Ctrl+C`. On Windows, use `py -3 server.py`.

## Where the data comes from

- [DEPLOY](https://registry.deploy.report/map): documented drone and robot deployments.
- [ADSB.lol](https://www.adsb.lol/docs/open-data/api/): identified unmanned aircraft positions.
- [NOAA](https://www.pmel.noaa.gov/usv-hurricane/): uncrewed ocean vehicle measurements.
- [EFF Atlas](https://www.atlasofsurveillance.org/atlas): documented public-safety drone programs.
- [NOAA CoastWatch](https://cwcgom.aoml.noaa.gov/erddap/tabledap/GLIDERS_LAST_10_DAYS_LOCATIONS.html): reported underwater glider locations.
- [ClimateViewer](https://climateviewer.org/history-and-science/government/maps/uav-drones-over-usa/): historical UAV records.

Coverage varies. Deployment areas and historical records are labeled separately from timestamped positions; this is not universal live tracking.

**[AGPL-3.0-or-later](LICENSE)** for our code. Third-party data keeps its own licenses. [Data details](docs/data-methods.txt) · [Advanced setup](docs/setup.md).
