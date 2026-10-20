# Wardrive contributions

Built by **Church of Malware / saviorSEC**. Free and open source.

1. Sign in to [your account](https://dronemapper.churchofmalware.org/account.html).
2. Open **Wardrive logs & upload tokens**, name your uploader, confirm sharing and
   create a token. Save it privately; it is shown once.
3. Export a completed wardrive as WiGLE CSV. Choose the file and its timestamp
   timezone, preview the matches, then upload. The browser accepts completed CSVs
   up to **256 MiB**, filters locally, and sends matching rows in small batches.
   Keep the page open; progress and Cancel are available. If interrupted, retry
   with the same token—completed batches will not count twice.
4. See accepted reports under **Possible signals** on the map. Older reports
   appear under **Ghosts** after 14 days. Remove an uploader and its reports in
   **Your nodes** to revoke its token.

The initial importer recognizes the same WiFi CAM and Tello-style network-name
patterns as our scanners. These are **unconfirmed signal areas**, not decoded
Remote ID or identified robots. Ordinary APs, BLE devices, cellular rows and
OUI-only matches are excluded. Raw CSVs, metadata, SSIDs and MACs are not stored.
Matched radio addresses are converted into server-keyed, uploader-specific
identifiers. Coordinates are rounded to 0.01-degree receiver-area cells.
Uploads keep `FirstSeen`; that field can predate a row's GPS fix in some exporters.
No log import establishes a live receiver, aircraft GPS position or direction.
Only dates within the past year are accepted. Retries do not inflate counts.

## Record in DRONEmapper without internet

Android **0.7.0**: **Start listening → Saved wardrives → Record a wardrive**.
Keep Wi-Fi, Bluetooth and Location enabled; they do not need an internet connection
to receive locally. Finish recording or stop listening when done. Saved trips stay
on the phone after app restarts. Live sharing pauses during recording.

At home, open the trip and choose **Upload later to DRONEmapper**, using the phone's
existing account connection. Keep the app open. Upload is a manual choice, not
triggered by reconnecting Wi-Fi. Failed/cancelled uploads keep the trip; retry with
the same connection without double-counting. Do not also reimport that trip's CSV
to DRONEmapper under a different token: separate uploader identities cannot be
automatically treated as the same device.

**Export WiGLE CSV** saves only matching Wi-Fi rows with fresh receiver GPS,
network names, radio MACs and measured signal strength. Unknown fields are blank.
The file follows [WiGLE's documented CSV format](https://api.wigle.net/csvFormat.html);
uploading it to WiGLE uses a WiGLE account. Live acceptance by WiGLE has not been
tested with a contributor account. Biscuit Manager CSV import has not been verified.
Decoded Remote ID is preserved in **Export DRONEmapper JSON**, not disguised as
Wi-Fi. Raw SDR spectrum does not create log sightings.

Native saved reports use **POST `/v1/observations/archive`**, a scanner-node bearer
key and the existing `schema_version: 1`, `node_id`, `observations` envelope.
Send 1–50 observations per request, within the past year, with original event IDs
and observation/reception times. Reuse the IDs when retrying. Raw Wi-Fi identifiers
and precise receiver GPS must not be sent; Wi-Fi areas use the existing 0.01° grid.
The CSV import token is separate and cannot call this endpoint. Full JSON exports
are archival files; split them into batches before using this API.

## Automatic completed-export uploads

Download [wardrive-upload.py](https://dronemapper.churchofmalware.org/downloads/wardrive-upload.py).
It uses Python 3.10+ on Linux, macOS or Windows and needs no extra packages.
On Windows use `py -3` in place of `python3`.

```sh
python3 wardrive-upload.py --save-token my-upload-token.txt
python3 wardrive-upload.py --file completed.csv --token-file my-upload-token.txt --consent
python3 wardrive-upload.py --watch ./completed-exports --token-file my-upload-token.txt --consent
```

Save completed exports in the watched folder. The uploader checks every minute,
waits for files to stop changing, filters irrelevant rows locally, sends bounded
batches and remembers completed files by hash. Keep the terminal running;
Ctrl+C stops it. An invalid/revoked token stops automatic uploads. Use a folder
of completed exports, not the file currently being recorded. No ZIP/GZIP/PCAP
files or raw Bluetooth notification streams are accepted by this CSV endpoint.

Most WiGLE/Kismet exporters use UTC. If an export uses unzoned local timestamps,
specify the capture-date offset, for example `--timezone=-07:00`. Mixed daylight
saving offsets require separate exports or explicit offsets in the timestamps.
Keep the token file private, outside the export/share folder. On Unix its mode
must be 600. The watcher state stores hashes, not tokens or observations.

## Integration API

- **POST** `https://dronemapper.churchofmalware.org/v1/wardrives`
- `Authorization: Bearer YOUR_DRONEMAPPER_UPLOAD_TOKEN`
- `X-Wardrive-Timezone: UTC` (or a numeric offset such as `+02:00`)
- `Content-Type: text/csv` with raw UTF-8 CSV, **or** `multipart/form-data` with
  one field named `file`. Do not send cookies or put tokens in URLs.
- **GET** the same endpoint with the bearer token to validate it and read limits.

Accepted headers are WiGLE's `MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,
CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type`; additional
columns including `Frequency` are permitted. A `WigleWifi-1.x` metadata line is
optional. CSV quoting, CRLF, BOM, 1.4/1.6 column layouts and Kismet kHz frequencies
are supported. Required numeric fields and timestamps must be valid; missing
coordinates never become zero-coordinate points. Unzoned dates require the
timezone header. Explicit ISO-8601 offsets take precedence.

A successful response reports `rows`, `candidates`, `accepted`, `duplicates`,
`unrelated`, `invalid` and `outside_time_window`. `accepted: 0` can be a successful
duplicate-only upload. The body is limited to 2 MiB, 10,000 rows and 500 matching
observations **per API request**, not per selected browser file. The browser and
folder uploader split larger sessions automatically. Maximum six uploads per
token per minute; respect `Retry-After` on 429. 401/403: stop and request a valid
wardrive token. 400/413/415/422: fix the file or request. Retries are idempotent
for the same uploader, address, original date, coarse area and signature.

Tokens only permit this import endpoint; they cannot sign in, manage an account,
submit live-node telemetry or read private logs. Do not reuse WiGLE/WDGWars keys.

## Biscuit and other apps

The tester's Biscuit Manager screenshot lists WiGLE, WDG Wars and Wardrift as
named upload destinations. We have not verified a configurable custom endpoint
in the released Manager app. Our endpoint and token do **not** automatically add
a fourth destination there. Export WiGLE CSV and import it here, or let the folder
uploader send completed exports. Direct automatic upload from Biscuit Manager
requires its developer to add a DRONEmapper destination or custom endpoint.
No changes have been submitted to that third-party app.

Biscuit's documented `DATA:AP` and `DATA:BT` stream is a separate device protocol.
Those lines alone omit GPS and timestamps and must not be treated as ready map
observations. A later bridge can attach the collector's genuine fix and time.
Ordinary Bluetooth records without decoded drone evidence are not autonomous
device detections.

References: [Biscuit wardrive protocol](https://codehedge.github.io/Biscuit-Wiki/3rd-party-integration/wardrive.html),
[Biscuit Manager](https://codehedge.github.io/Biscuit-Wiki/apps/),
[Kismet's WiGLE CSV exporter](https://github.com/kismetwireless/kismet/blob/master/kis_wiglecsvlogfile.cc),
[WDGWars' published integration contract](https://www.wdgwars.pl/press).
This is an independent implementation; no API credentials or third-party data
were pulled from those services.
