# DRONEmapper Node

Free, open-source Android scanner by **[Church of Malware](https://churchofmalware.org/)** and **[saviorSEC](https://churchofmalware.org/work/), the Church’s research branch**.

Android 8+. No root or Bluetooth dongle.

1. Install the APK from [Android nodes](https://dronemapper.churchofmalware.org/nodes.html). Allow installation from your browser when Android asks.
2. Enable Bluetooth, Wi-Fi and Location. Tap **Start listening** and grant radio permissions.
3. Nearby Remote ID broadcasts and matching Wi-Fi camera / Tello-style signals appear with their radio address.
4. To contribute, tap **Connect to DRONEmapper** → **Continue in browser**. Create an account, verify your email, sign in and approve the matching phone code. Return to **Sharing choices**, enable the reports you want to share and tap **Save**.
5. Choose a display name or remain **Anonymous**. Public names are optional; email stays private. **Open world map** takes you straight to the website.

Expand or collapse the live list and radar. The **Signals** view puts glowing dots inside the circle; glow size follows measured signal strength, and the dot layout is not a location. **Positions** plots fresh broadcast coordinates relative to the phone. Optional radar GPS stays on the phone. Tap a dot for type, MAC, strength and age. Their direction and distance are unknown. Tap **What we scan** for supported signals. Offline OUI lookup shows the radio registrant, not proof of a device type.

Sharing starts off each session. Raw MACs and network names stay on your phone. A Wi-Fi name match is not proof of a drone; changing addresses may create separate profiles.

## Record offline, upload at home

Version **0.8.0** expands the shared offline FAA catalog to 3,738 rules across 141 manufacturer/model/module combinations. Overlapping model declarations remain unknown.

Version **0.7.2** added a direct **Open SDR** action when HackRF is selected in the Wi-Fi menu, and identifies PortaPack Mayhem serial mode. It retains the expanded offline FAA model catalog.

Version **0.7.0** added **Saved wardrives · record / upload / export**.
Start listening, open that button, then choose **Record a wardrive**. No account
or internet is needed to record. Live sharing pauses while the trip records.
Tap **Finish recording** or **Stop listening**; saved trips survive app restarts.

At home, connect this phone to your account, open a saved trip and choose
**Upload later to DRONEmapper**. Keep the app open until finished. The original
dates are preserved; retrying the same trip with the same phone connection does
not double-count. Uploading does not delete the local trip. Reports up to one year
old are accepted. Uploads are manual; reconnecting Wi-Fi does not start one.

**Export WiGLE CSV** saves matching Wi-Fi observations with fresh receiver GPS,
names, MACs, frequency and signal strength. Send it to WiGLE using your WiGLE
account or another service that accepts that format. Your DRONEmapper token
does not authorize WiGLE. Biscuit Manager CSV import is **not verified**.
Remote ID reports use **Export DRONEmapper JSON** instead; they are not Wi-Fi rows.

Recording is opt-in. Exact receiver GPS and Wi-Fi identifiers remain in private
phone storage until you explicitly export them. Native map uploads send rounded
Wi-Fi receiver areas and broadcast-reported Remote ID positions. No GPS means no
Wi-Fi map point or CSV row. Ordinary Wi-Fi networks and raw SDR spectrum are not
saved as drone sightings. Repeated contacts are sampled at most once per 30 seconds.
Up to 100 trips / 100,000 saved rows are kept; export and delete old trips if full.
Deleting a local trip does not remove previously uploaded map reports.

Optional USB: **MT7610U / MT7612U** receive drivers cover the Panda / Alfa IDs below; **RTL8187L (0bda:8187)** covers 2.4 GHz channels 1–11. Other chipsets need their own driver.

Build from the repository root with JDK 17, Python 3, Android SDK 35 and NDK 28.2.13676358:

```sh
cd android-node
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

**Data credit:** [OUI Master Database](https://github.com/Ringmast4r/OUI-Master-Database) by **Ringmast4r**, using IEEE Registration Authority entries, powers the app’s offline MAC-prefix/radio-vendor lookup. A vendor allocation does not establish a device’s type or owner.

[Setup](../docs/android-node-setup.md) · [Radio support](../docs/node-radio-research.md) · [GPL v2](LICENSE) · [Credits](NOTICE.txt)

## USB adapters

Version **0.5.1** adds rootless MT7610U (Panda PAU0D) and MT7612U (Alfa
AWUS036ACM) receive drivers. Open **USB Wi-Fi adapter**, select the adapter,
tap **Connect**, then **Allow**. Every phone uses the same controls. The screen
shows channels, received frames and decoded Remote ID counts. See the
[compatibility and test steps](../docs/usb-scanner-testing.md) before testing other adapters.

Building native USB support requires Python 3 and Android NDK **28.2.13676358**.
Install that NDK through SDK Manager; Gradle builds the bundled source for ARM64,
ARMv7 and x86-64. Linux and macOS build hosts are supported.

## HackRF SDR

The **0.6.0** build adds **USB SDR · HackRF → Choose receiver → Connect → Allow**
for local RF spectrum reception, alongside Wi-Fi and Bluetooth. Use a PortaPack's
HackRF USB mode. This Android path does not yet include the desktop DJI / ADS-B
protocol decoders. [Setup and hardware test steps](../docs/android-hackrf.md).

## Update the app

Download the latest APK from [Android nodes](https://dronemapper.churchofmalware.org/nodes.html)
and install it over the existing app; do not uninstall first. Official releases
use the same signing key to preserve your pairing and settings. Check **Phone
capabilities** for version **0.8.0**. Updates are manual for now.

Start listening again, reconnect your USB adapter, and enable your preferred
**Sharing choices** if you want reports on the map. For a test report, connect
the adapter and use **Phone capabilities → Copy report**.

## Robot signals

A supported CyberDog Bluetooth advertisement appears in the list and Signals radar as a **possible robot dog**. Enable **Sharing choices → Share approximate robot signal areas** separately to contribute a rounded receiver area. Saved wardrives include positioned robot reports in DRONEmapper JSON; WiGLE CSV remains Wi-Fi-only. [Protocol and test status](../docs/robot-signals.md).
