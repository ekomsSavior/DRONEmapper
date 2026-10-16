# Node radio research

Research checked 2026-10-16. **Church of Malware / saviorSEC.** The first deliverable is an optional Android contributor app; map visitors still use only their browser. Code status below does not imply reception has been tested on a particular phone.

## Implemented receive paths

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

Two nodes reporting the same claimed identifier are merged for display; that does not authenticate the transmitter. Public node enrollment/revocation, timestamp validation, duplicate suppression and same-time position conflict flags are implemented. Cryptographic Remote ID authentication and broader trajectory plausibility checks remain future work.

## After phone testing

1. Record each phone’s capabilities and real transport reception; confirm screen-off operation and battery use.
2. Identify the user’s USB adapter by VID/PID and revision. Add and bench-test its rootless driver rather than promise all adapters work.
3. Add model enrichment only where identifiers support it. Keep unknowns visible.
4. HTTPS node enrollment and website ingestion are implemented. Live website testing and repository publication were authorized; 0.4.0 has been tested with a real Wi-Fi camera candidate on the Moto.
5. Add owner-authorized robot/fleet adapters and Raspberry Pi receivers as separate modules. They should share a provenance-aware observation contract, not force every vehicle into the Remote ID decoder.

No DroneAware software, paywalled feed, private node or access-control bypass is needed for this design. Public workflow research informed the approach; the app, local ingestion and map integration are our own work, with the USB driver’s upstream authors credited separately.

## Identification and repeated sightings (2026-10-16 UTC)
The bundled FAA catalog contains 110 declared serial ranges covering 84 distinct manufacturer/model/device-type combinations, reviewed from the FAA public Declarations of Compliance service. It is a subset, not an exhaustive supported-drone list. Exact declared serial-range matches can suggest aircraft make/model; ambiguous matches remain unknown. A broadcast module identifies the module, not its host. A match does not authenticate identity or establish current regulatory compliance. Each range carries its FAA evidence link in worker/rid-catalog.mjs.

A full Wi-Fi BSSID or Bluetooth address is shown only on the collecting phone. Repeated candidate BSSIDs receive per-install HMAC identifiers and per-node server HMAC profile IDs. No raw address is uploaded. Do not group devices by OUI alone; it can describe radio hardware rather than aircraft maker. Locally administered addresses may be randomized; globally assigned addresses can also be spoofed. Android documents address randomization at https://source.android.com/docs/core/connect/wifi-mac-randomization .

Ghosts are observed profiles with no new report for 14 days, for every positioned vehicle type and candidate signal. Refetching unchanged data does not refresh last seen. Daily summaries retain at most 365 recorded dates; detailed node events expire after 24 hours. Published program/deployment records retain their evidence dates instead of being turned into fabricated sightings.


## Communication investigation — 2026-10-16

A usable map observation needs a device identifier, a position with its coordinate system, the time that position was measured, and permission to reuse the data. A radio band, MQTT topic, OUI allocation or server address alone supplies none of those guarantees.

### Dedrone evidence review

The supplied local evidence contains Prometheus-style MQTT queue/publish/subscribe counters, JVM telemetry and topic labels. Topic paths reference AeroScope, Echodyne and a TDOA fusion component. The counters include live-alert and sensor-state topic names, but the examined text exports contain no latitude/longitude fields or actual detection message bodies. The file named as a compressed backup is not a valid tar archive.

This suggests sensor-to-server integration, not a portable RF fingerprint database. A count of messages on a live-alert topic cannot become a drone sighting. The report's security conclusions were not independently verified. Scripts and endpoints from that evidence were not executed or probed, and target addresses, sensor identifiers and raw evidence are excluded from this repository.

### Which communications can produce a map point?

| Family | Documented communication | Useful map fields / limitation | Integration status |
| --- | --- | --- | --- |
| Remote ID consumer, delivery and public-safety aircraft | Standard BLE, Wi-Fi beacon and NAN broadcasts | ID, broad aircraft type and reported coordinates. Operator purpose is not implied. | Android receiver implemented; actual Remote ID airframe testing remains pending. |
| WiFi CAM toy aircraft | Camera access-point name matching the photographed product's setup; controller link may be separate | Local BSSID, SSID, RSSI and reception time. No target GPS/bearing. | Real Moto reception previously verified; opt-in coarse receiver areas. |
| Ryze Tello | Documented TELLO-XXXXXX Wi-Fi network; separate SDK messages on a connected network | SSID pattern is a candidate only; an access point can imitate it. | Narrow six-character uppercase/alphanumeric pattern added in 0.4.1; no connection or flight commands. [Official manual/downloads](https://www.ryzerobotics.com/tello/downloads). |
| DJI enterprise aircraft / docks | Cloud API uses MQTT, HTTPS and WebSocket via Pilot 2 or Dock | Aircraft OSD includes latitude/longitude; dock OSD identifies the dock, not the flying aircraft. | Owner-connected adapter candidate; not an anonymous global feed. [DJI overview](https://developer.dji.com/cloud-api/), [aircraft properties](https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/aircraft/properties.html). |
| Proprietary DJI air links | Protocol-specific RF capture; separate from standard Remote ID | Some research decoders recover DroneID from tested models. This does not establish support for later links. | Research only: [DroneSecurity](https://github.com/RUB-SysSec/DroneSecurity) tested a particular SDR/model setup, not ordinary phone Wi-Fi. |
| Parrot ANAFI / ANAFI Ai | Wi-Fi and, for Ai, 4G through vendor SDK/network interfaces | Telemetry is available within the owner's connected system; cellular access involves pairing credentials. | Authorized SDK adapter candidate. [Connectivity](https://www.parrot.com/en/drones/anafi-ai/technical-documentation/connectivity), [Olympe connection guide](https://developer.parrot.com/docs/olympe/userguide/advanced/physical_drone.html). |
| ArduPilot / PX4 and other MAVLink systems | MAVLink message protocol over a configured serial, UDP or radio transport | GLOBAL_POSITION_INT uses scaled latitude/longitude; boot-relative time needs a valid clock mapping. Heartbeats alone are not positions. | Owner telemetry adapter candidate. [Message definitions](https://mavlink.io/en/messages/common.html#GLOBAL_POSITION_INT). |
| ExpressLRS FPV / RC | Specialized 2.4 GHz and sub-GHz radios; Gemini may use two bands | Control/telemetry link is not an Android Wi-Fi frame merely because the band overlaps. | Requires a compatible receive chain and independently tested decoder. [ExpressLRS Gemini](https://www.expresslrs.org/software/gemini/). |
| Industrial mobile robots / AGVs | VDA 5050 MQTT with JSON state, visualization and factsheet topics | Local map x/y/theta plus mapId; model/serial fields. Requires a surveyed map transform for Earth coordinates. | Read-only owner feed candidate. [Official VDA 5050 specification](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md). |
| Boston Dynamics Spot | Wi-Fi / Ethernet and network API services | Robot-local frames must be transformed using known localization. A nearby AP is not a global position report. | Owner SDK integration candidate. [Spot networking](https://dev.bostondynamics.com/docs/concepts/networking.html). |
| Unitree robot dogs / humanoids | SDK2 / Cyclone DDS on the configured robot network | Robot state and local pose, depending on product/configuration. Not a standardized public beacon. | Owner network adapter candidate. [Unitree ROS2](https://github.com/unitreerobotics/unitree_ros2), [SDK2](https://github.com/unitreerobotics/unitree_sdk2). |
| Radar-derived detections | Dedicated radar hardware and a processing network | Tracks require sensor location/orientation and a defined target classification. A radar track may be a bird or other moving object. | No radar hardware or authorized stream connected. [Echodyne EchoWare](https://www.echodyne.com/radar-systems/echoware). |
| Delivery/security robots, driverless vehicles, robot service appliances | Product-specific fleet networks; no universal public ID located in this review | Published deployments are usable areas; vendor connectivity is not proof of publicly available vehicle telemetry. | Keep documented areas; evaluate each named operator's public or contributed feed separately. |
| Ocean gliders / surface research vessels | Satellite/cellular links and publicly published operator data | Provider timestamps, WMO/vehicle identifiers, coordinates and quality flags | Existing NOAA and VOTO collectors. |
| Argo profiling floats | Surface position and satellite relay, then public GDAC publication | Good-quality surface fixes and position timestamps; underwater location between surfacings is unknown | Added public Ifremer ERDDAP collector, refreshed by the shared five-minute collection. [Argo telecoms](https://argo.ucsd.edu/how-do-floats-work/telecommunications-systems/), [official data access](https://www.argodatamgt.org/DataAccess.html). |

### MQTT integration design

MQTT is a message transport over an established network connection. A listener still needs the correct broker, subscription permission, topic schema and public-sharing permission. No private fleet broker is connected by this release.

The first useful adapters are DJI aircraft OSD and VDA 5050 robot state. Run a read-only bridge beside the owner's broker with an explicit device/topic allowlist, bounded payload sizes and TLS certificate validation. Do not subscribe to every topic or publish orders. Credentials belong in the bridge, never the browser or public Android app.

For DJI, preserve the OSD measurement time, distinguish aircraft serials from gateways, reject invalid coordinates, and omit home/controller positions. For VDA 5050, pin the schema version: v2 agvPosition and v3 mobileRobotPosition are not interchangeable. Require a mapId-to-WGS84 transform; otherwise retain a local observation rather than guessing a world position. For MAVLink, also require a stable configured vehicle identity and valid time synchronization.

Each adapter must preserve actual observation time, schema/version, transport, identity confidence, coordinate source and contributor consent. Repeated cached or retained MQTT messages must not refresh last-seen. A disconnected broker must not make its last message look live. These requirements are a design for the next owner-connected integration, not a claim that those feeds are already operating.

### Radar correction and candidate coverage

Version 0.4.2 keeps unlocated contacts within the expanded radar panel, including when the separate live list is collapsed. Dots replace device words on the radar: cyan for reported aircraft, amber for possible Wi-Fi links, gray for unknown type. Unlocated dots sit in a separate row below the compass; tapping them shows local MAC, candidate label, signal strength and age. Fresh Remote ID coordinates plot relative to a fresh opted-in phone position; missing or stale coordinates stay in the unlocated panel. No arbitrary compass angle or RSSI-derived distance is drawn.

Android Wi-Fi RTT measures range only with compatible ranging hardware and peers; it cannot supply bearing to any arbitrary toy drone. See [Android Wi-Fi RTT](https://developer.android.com/develop/connectivity/wifi/wifi-rtt). The new **What we scan** dialog lists actual supported receive paths and their limits.

### Worldwide public data added

The Argo collector reads a bounded recent ERDDAP subset, keeps only position/time QC flag 1 and known reported positioning methods, checks both profile and position time, and selects the newest surface fix per WMO identifier. Interpolated flag 8, unknown/bad quality, missing time, future positions and invalid coordinates are excluded. Manufacturer and operator remain unset when the record does not establish them.

A real collection on 2026-10-16 accepted 334 distinct floats. Counts will change as observations arrive and age. These autonomous platforms control vertical profiling and drift horizontally; their positions are not drone flights or powered navigation tracks. Current observations enter the 24-hour feed, and production profiles preserve original timestamps for subsequent history/ghost display.

[Argo's data-use policy](https://argo.ucsd.edu/data/acknowledging-argo/) permits unrestricted use and requests acknowledgment. Attribution and [dataset DOI 10.17882/42182](https://doi.org/10.17882/42182) are included in credits and the attributed export. The ERDDAP metadata license field was malformed at review time; the official program's explicit policy supplies the data-use basis instead.

### Next bench work

1. Test genuine Remote ID aircraft across Bluetooth legacy/extended/Coded, Wi-Fi beacon and supported NAN phones; record model, OS and transport.
2. Test a real Tello name match and the corrected radar with live received data. Synthetic regression fixtures never enter production.
3. Identify an available USB adapter's chipset before integrating another rootless driver.
4. Connect one consenting DJI or VDA 5050 fleet with a documented telemetry sample and, for local robot pose, a verified coordinate transform.
5. Evaluate additional public operator feeds independently for timestamps, permitted reuse and overlap with existing vehicle identifiers.
