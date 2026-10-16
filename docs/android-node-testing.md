# Phone acceptance test

**Status: signed Android 0.4.2 installed; real Wi-Fi camera-signal radar dots and tap details verified on the Moto. Account pairing and uploads were verified with 0.4.0. Remote ID and external USB RF acceptance remain pending.** A successful APK build, parser tests and HTTP tests do not establish RF reception or Android background reliability. Use the same checklist for all three phones; exact models are read by the app.

| Check | Phone 1 | Phone 2 | Phone 3 |
| --- | --- | --- | --- |
| Manufacturer / model / Android from capability report | Motorola moto g 5G - 2024; Android 14 / API 34 | Pending | Pending |
| Install and launch without root | Passed, signed 0.4.2 APK | Pending | Pending |
| Grant / deny Nearby devices and Location without crashing | Grants and startup passed; denial cases pending | Pending | Pending |
| Bluetooth disabled / enabled, scan restart | Pending | Pending | Pending |
| Real BLE legacy Remote ID decoded | Pending | Pending | Pending |
| Extended / Coded PHY supported and received | Pending | Pending | Pending |
| Wi-Fi beacon position received (API 30+) | Pending | Pending | Pending |
| Wi-Fi Aware supported and received | Pending | Pending | Pending |
| Screen locked for 10 minutes, notification remains, reception recorded | Pending | Pending | Pending |
| Stop action releases radios and ends upload | Pending | Pending | Pending |
| Email verification and browser device approval | Passed on production | Pending | Pending |
| Real Wi-Fi camera signal shown locally and uploaded | Passed; timestamps and repeat reports verified on production | Pending | Pending |
| Unlocated radar dot and tap details | Passed with real WiFi CAM signal in 0.4.2 | Pending | Pending |
| Fresh observation appears on local map | Pending | Pending | Pending |
| Airplane mode / offline queue / reconnect keeps original time | Pending | Pending | Pending |
| USB adapter ID / power / permission / attach / detach | Pending | Pending | Pending |
| Heat and battery consumption after 30 minutes | Pending | Pending | Pending |


## Moto live acceptance — 0.4.2, 2026-10-16

Installed the signed update on the same Moto without clearing its account. The
powered WiFi CAM toy drone appeared as an amber glowing dot in the unlocated row
below the compass. Tapping the actual dot opened its signal name, local MAC,
RSSI and age; the checked reading was -30 dBm and 28 seconds old. Direction and
distance remained unknown. Device labels no longer cover the radar, and the live
list retains the signal details. No synthetic detections were installed.

Sharing was off during this display test, so this check does not establish a new
0.4.2 production upload. Automated checks passed: 59 Android tests, 35 JavaScript
tests and 45 Python tests; debug/release builds and Android lint passed. Tests
cover collapsed-list refresh, stale coordinates, dot details and the Tello-style
name filter. Real Tello, Remote ID positions, USB capture and background endurance
still need physical acceptance tests.

## Moto live acceptance — 0.4.0, 2026-10-15

A real account received its verification email, completed verification, and approved
the Moto through the browser. The app connected without manual key copying.
After the tester opted into sharing and restarted the WiFi CAM drone, the app
displayed its actual camera-link signal, local MAC, signal strength and upload
acknowledgment. The production map showed the node online, fresh timestamps,
eight repeat observations by 22:57 PDT, and anonymous attribution.

The map received a rounded 0.01-degree receiver area. The camera link supplied
no aircraft GPS or authenticated make/model. No synthetic reports were uploaded.
The signed APK and downloadable source matched their local hashes. Automated
checks passed: 53 Android tests, 31 JavaScript tests and 42 Python tests; Android
lint had no errors. The physical Remote ID, USB and endurance checks remain open.

## Earlier Moto check — 0.1.0, 2026-10-15

Installed and launched the debug APK over authorized ADB. The phone reports BLE,
extended advertising, Coded PHY, Wi-Fi beacon API and USB Host support; Wi-Fi
Aware is unavailable. Bluetooth scanning started and Wi-Fi scan results arrived.
The foreground scan service remained active during the initial check, with no
matching app crash or Bluetooth scanner errors in the app process log. Precise
Location and Nearby devices permissions were granted. Notifications were denied;
that choice was retained. Notification visibility is therefore not yet verified.

Configured sharing to the local test server through an ADB USB reverse tunnel.
A GET request from the Android app user ID reached the local feed with HTTP 200.
This verifies network reachability, not an observation upload. Phone and computer
clocks differed by about one second. No Remote ID observations were received and
no synthetic detections were inserted. Real reception, authenticated observation
upload, screen-off reliability, stop/restart behavior, external USB capture and
endurance remain pending. The USB tunnel requires the phone to remain connected
to this computer. Nothing was published or pushed.

Use an actual Remote ID drone or module you can compare against a known position and a reference receiver. Availability of one has not yet been confirmed. A missing detection is not evidence that a particular phone or aircraft supports no Remote ID; record the transmitter, transport, distance, Android settings and conditions. Keep transmitter operation under its owner’s control.

For USB, record the exact USB vendor/product ID, adapter hardware revision, OTG cable and power arrangement. Only RTL8187L `0bda:8187` is accepted by this prototype. Its receive path is unverified until this bench test passes. Never mark a chipset supported merely because Android enumerates it.

The location on the map must match the **aircraft broadcast**, not the phone’s position. Unknown model/operator/purpose must stay unknown. No mock records or generated trajectories belong in the app or live map.

Automated checks, isolated from runtime map data:

```sh
python3 -m unittest discover -s tests
npm test
cd android-node
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

The decoder tests use independent OpenDroneID C encoder vectors, malformed frames, timestamp rollover, stale positions and transport filtering. Backend tests cover authentication, batch rejection, deduplication, retention and the map-feed contract. Synthetic test fixtures are only in test source directories and temporary databases; they are not installed as detections.

HTTPS, individual revocable node credentials, request limits and separate area-sharing consent are implemented and covered by tests. The earlier Python local shared-key server remains a separate development harness.
