# Node radio research

Research checked 2026-10-15. **Church of Malware / saviorSEC.** The first deliverable is an optional Android contributor app; map visitors still use only their browser. Code status below does not imply reception has been tested on a particular phone.

## Implemented for local testing

| Receive path | Implementation | Limits |
| --- | --- | --- |
| Built-in Bluetooth LE | Android BLE scan API, ASTM service UUID `0xFFFA`, application code `0x0D`; legacy and extended scanning; Coded PHY when the controller supports it | A phone may lack extended/Coded reception; Bluetooth branding alone is insufficient. Permission and OEM power behavior matter. |
| Built-in Wi-Fi beacons | Public `ScanResult.InformationElement` API on Android 11+; vendor IE `FA:0B:BC`, type `0x0D` | Android throttles scans; cached results retain their reception time. This is not general monitor mode. Available bands depend on the phone. |
| Built-in Wi-Fi Aware / NAN | Passive subscription to `org.opendroneid.remoteid` on supported Android 8+ hardware | Optional hardware feature; availability can conflict with hotspot/other radio uses. Aware discovery may itself exchange management traffic; “passive subscription” does not mean an RF-silent phone. |
| USB Wi-Fi, no root | Android USB Host permission plus adapted RTL8187L userspace driver | Experimental, only `0bda:8187`, 2.4 GHz ch 1–11. No hardware verification yet. No packet injection UI or arbitrary packet storage. |

The new decoder accepts protocol version 2 Basic ID and Location messages, individually or in message packs. It validates lengths, coordinate ranges and the location timestamp before upload. Unknown versions, system/operator/pilot fields and authentication messages are not used. Authentication signatures are **not verified**; received ID and coordinates remain claims.

Sources: [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [Wi-Fi scanning](https://developer.android.com/develop/connectivity/wifi/wifi-scan), [Wi-Fi Aware](https://developer.android.com/develop/connectivity/wifi/wifi-aware), [OpenDroneID protocol implementation](https://github.com/opendroneid/opendroneid-core-c), [reference Android receiver and phone matrix](https://github.com/opendroneid/receiver-android).

## Rootless USB Wi-Fi is real, but chipset-specific

Android’s [USB Host API](https://developer.android.com/develop/connectivity/usb/host) grants an application access to a USB device after the owner approves. A userspace driver then handles that chipset’s registers, firmware and frame transport. This avoids requiring a rooted phone or a custom kernel. An external antenna improves the attached radio’s reception; it does not make Android’s internal Wi-Fi chip support arbitrary capture.

The initial driver is adapted from [Kismet Android PCAP](https://www.kismetwireless.net/static/android-pcap/) and its [archived source](https://github.com/gnyman/AndroidPCAP). We narrowed it to one USB ID, disabled TX command bits, checked descriptor lengths/CRC flags, removed packet logging and omitted its uncalibrated signal estimates. This is a test candidate, not a recommendation to purchase old hardware.

For modern adapters, [OpenIPC devourer](https://github.com/OpenIPC/devourer) documents Android userspace operation through PixelPilot and several Realtek backends, including RTL8812AU and newer families. It is a candidate for a receive-only native adapter module after the actual USB IDs are known; it is **not bundled in this APK**. Its GPL v2 license, per-chip support, firmware obligations, Android native builds and receive behavior need review when integrating. [Kismet’s USB userspace source](https://kismetwireless.net/docs/readme/datasources/wifi-usb-userspace/) also documents newer MediaTek support; that desktop source is not proof of a ready Android port.

A generic Linux monitor-mode driver cannot simply be installed by an unprivileged Android app. Device enumeration, firmware bring-up, channel changes, reception, detach and power loss each require hardware testing. Different hardware revisions under the same retail adapter name can change the chipset.

## Coverage of everything already on the map

| Map category / signal family | Practical collection route | What this Android build can establish |
| --- | --- | --- |
| Consumer, delivery and public-safety drones broadcasting Remote ID | Nearby BLE / Wi-Fi Remote ID; merge reports from optional contributor nodes | Broadcast ID, airframe category and reported position. Brand or airframe category does not establish police/delivery/personal use. |
| Older DJI / proprietary control and video links | Protocol-specific RF hardware and decoder research | Unsupported. [DroneSecurity](https://github.com/RUB-SysSec/DroneSecurity) is a specific SDR research implementation, not a universal current DJI decoder. A USB Wi-Fi radio cannot decode every proprietary waveform. |
| Owner-operated MAVLink aircraft | Owner-authorized telemetry feed with explicit IDs and position fields | Future adapter. [MAVLink](https://mavlink.io/en/) is a message protocol, not a universal RF signal. Do not treat any nearby Wi-Fi host as a telemetry source. |
| Robot dogs / humanoids | Owner-authorized robot SDK, fleet feed, or dated human observation | No universal public Remote ID identified. [Spot networking](https://dev.bostondynamics.com/docs/concepts/networking.html) and [Unitree SDK2](https://github.com/unitreerobotics/unitree_sdk2) describe robot-network integration, not a global public location broadcast. Local robot XYZ coordinates are not latitude/longitude. |
| Delivery and security robots | Documented deployment areas, operator-authorized telemetry, dated sightings | No position can be inferred reliably from a brand-like SSID, OUI or BLE name. [Starship’s FAQ](https://www.starship.xyz/faq/) describes its robots; it does not supply universal passive receiver access. |
| Industrial robots / AGVs | Authorized fleet interfaces, such as [VDA 5050](https://github.com/VDA5050/VDA5050) | Future separate integration. Fleet-control interfaces are not public broadcasts. |
| Driverless cars | Published service areas or permitted fleet-position feeds | Remote ID drone decoder does not identify them. Cellular communications with a backend are not a public location feed. |
| Surface vessels / underwater gliders | Existing permitted NOAA / VOTO sources; authorized AIS/telemetry where available | Existing web collectors remain the useful wide-area route. The phone does not receive arbitrary marine VHF or underwater/satellite telemetry. |
| Historical programs / UAV imagery | Existing documented program and survey datasets | Historical/deployment records stay separate; they never become live node sightings. |

## Identity, range and quality

Remote ID Basic ID generally supplies an identifier and broad airframe category, not a universal model-name field. FAA declarations and serial-prefix manufacturer tables may help with later enrichment, but retrofit broadcast-module manufacturers can differ from the airframe maker. Any lookup needs an explicit confidence and ambiguity policy. Operator role needs separate evidence.

RSSI is signal strength, not range or a target position. Multipath, obstructions, antenna orientation and transmitter power prevent a phone from turning one RSSI value into reliable coordinates. This build uses broadcast drone coordinates only; no RF-propagation circles masquerade as measured locations. Wide-area coverage comes from many independent contributors plus the existing public-data collectors.

Two nodes reporting the same claimed identifier are merged for display; that does not authenticate the transmitter. The public rollout will need duplicate/spoof handling, clock quality, impossible-jump checks that flag rather than silently invent routes, and per-node enrollment/revocation. A local HTTP test server is not a completed public trust system.

## After phone testing

1. Record each phone’s capabilities and real transport reception; confirm screen-off operation and battery use.
2. Identify the user’s USB adapter by VID/PID and revision. Add and bench-test its rootless driver rather than promise all adapters work.
3. Add model enrichment only where identifiers support it. Keep unknowns visible.
4. HTTPS node enrollment and website ingestion are implemented. The user authorized live website testing on 2026-10-15; repository pushes remain on hold.
5. Add owner-authorized robot/fleet adapters and Raspberry Pi receivers as separate modules. They should share a provenance-aware observation contract, not force every vehicle into the Remote ID decoder.

No DroneAware software, paywalled feed, private node or access-control bypass is needed for this design. Public workflow research informed the approach; the app, local ingestion and map integration are our own work, with the USB driver’s upstream authors credited separately.

## Identification and repeated sightings (2026-10-16 UTC)
The bundled FAA catalog contains 110 declared serial ranges covering 84 distinct manufacturer/model/device-type combinations, reviewed from the FAA public Declarations of Compliance service. It is a subset, not an exhaustive supported-drone list. Exact declared serial-range matches can suggest aircraft make/model; ambiguous matches remain unknown. A broadcast module identifies the module, not its host. A match does not authenticate identity or establish current regulatory compliance. Each range carries its FAA evidence link in worker/rid-catalog.mjs.

A full Wi-Fi BSSID or Bluetooth address is shown only on the collecting phone. Repeated candidate BSSIDs receive per-install HMAC identifiers and per-node server HMAC profile IDs. No raw address is uploaded. Do not group devices by OUI alone; it can describe radio hardware rather than aircraft maker. Locally administered addresses may be randomized; globally assigned addresses can also be spoofed. Android documents address randomization at https://source.android.com/docs/core/connect/wifi-mac-randomization .

Ghosts are observed profiles with no new report for 14 days, for every positioned vehicle type and candidate signal. Refetching unchanged data does not refresh last seen. Daily summaries retain at most 365 recorded dates; detailed node events expire after 24 hours. Published program/deployment records retain their evidence dates instead of being turned into fabricated sightings.
