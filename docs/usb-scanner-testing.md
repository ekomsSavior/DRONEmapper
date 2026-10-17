# USB scanner testing

Built by **Church of Malware / saviorSEC**. Android 8+, no root. Bluetooth uses
the phone itself. Connect USB Wi-Fi through OTG; a powered hub can help supply power.

## This build

| Adapter / USB ID | Driver route in DRONEmapper | Physical reception |
| --- | --- | --- |
| Panda PAU0D AC600, 0e8d:7610 | MT7610U native USB receiver, 2.4 / 5 GHz | Frame reception confirmed on Moto / Android 14; Remote ID reception pending |
| Alfa AWUS036ACM, 0e8d:7612 | MT7612U native USB receiver, 2.4 / 5 GHz | Awaiting test |
| RTL8187L, 0bda:8187 | Existing Java receiver, 2.4 GHz | Awaiting test |
| RT5572, 148f:5572 | Identified; capture driver not bundled | Unavailable |
| TL-WN722N v1, 0cf3:9271 | AR9271 identified; capture driver not bundled | Unavailable |
| TL-WN722N v2/v3, 2357:010c | RTL8188EUS identified; capture driver not bundled | Unavailable |
| Other AC600 adapters | Need USB ID: AC600 describes a speed class | Unknown |

The Pixel capability flags describe Android APIs. They cannot confirm reception
through an external USB adapter. A missing device in the chooser means USB
attachment / power / enumeration must be checked before its driver.

## Test on a phone

1. Install the test APK over the existing app; keep your account pairing.
2. Start listening. Attach the adapter, tap **USB Wi-Fi adapter**, select its radio
   button, then tap **Connect** and **Allow** in Android's USB prompt. This flow is
   the same on every phone. If the list is empty, tap **Refresh** after attaching.
   An unsupported chipset stays selectable for details, but Connect is disabled.
3. Watch **USB Wi-Fi**: initialization, channel, total received frames, and
   valid Remote ID frames. Zero Remote ID with nonzero frames is possible;
   ordinary Wi-Fi traffic is not proof of a drone.
4. Power a known Remote ID transmitter nearby. Confirm its ID / position in the
   live list. For a WiFi CAM toy, look for a **possible drone / camera link**.
5. Unplug and reconnect, test Stop / Start, and repeat through the powered dock.
6. Copy **Phone capabilities** with the adapter still attached. The report includes
   app version, VID:PID, chipset, permission, interface / endpoint counts and scanner
   state. It excludes phone identifiers, USB serials, nearby MACs and location.

No synthetic records are uploaded. Radio reception tests and optional website
sharing tests are separate. The new `usb-wifi-nan` transport must be enabled on
the receiving server before NAN reports can upload.

## What Marauder contributes to the design

Reviewed [RemoteIdDecoder.cpp](https://github.com/justcallmekoko/ESP32Marauder/blob/d3ceb28afeda1196ca27c13adeaa69ada52383f3/esp32_marauder/RemoteIdDecoder.cpp)
and [WiFiScanRemoteId.h](https://github.com/justcallmekoko/ESP32Marauder/blob/d3ceb28afeda1196ca27c13adeaa69ada52383f3/esp32_marauder/WiFiScanRemoteId.h).
It decodes public ASTM/OpenDroneID BLE service 0xFFFA, vendor beacons FA:0B:BC / 0x0D,
and NAN service hash 88:69:19:9D:92:09. Fields include aircraft identity / type,
position, geodetic / pressure altitude, height, heading, horizontal / vertical speed,
status, accuracy and timestamp. It also parses system / operator / authentication
messages; seeing those fields is not cryptographic verification of identity.

DRONEmapper retains aircraft identity and fresh valid location / motion, and avoids
collecting pilot / operator coordinates. This update adds the missing raw USB NAN
path, correct colon-formatted radio addresses, camera-link candidates on USB,
and extra dwell on discovery channels 6 / 149 when available while sweeping the
remaining driver-supported channels. BLE and the phone's Wi-Fi Aware continue
independently. Receive frames are decoded transiently; no general packet archive.

Wardrive Go's USB support is implemented with chipset-specific userspace drivers,
not a generic Android Wi-Fi switch. Its public driver set includes MT7612U;
MT7610U is a different driver. Our MediaTek port uses compatible Kismet / Linux
sources; it does not copy Wardrive Go's GPL-3.0 driver implementation.

## Limits and next adapters

Remote ID identifies aircraft broadcasts. It does not announce every robot or
self-driving vehicle. OUI / SSID alone cannot establish autonomous operation.
Proprietary links such as OcuSync, FHSS toy controllers, cellular and private MQTT
need an actual supported decoder or an operator-authorized feed. Wi-Fi monitor
mode cannot decrypt an arbitrary encrypted control or fleet session.

Next hardware work: validate Remote ID decoding on the Panda and frame reception
on the Alfa, then a compatible AR9271 / RT5572 userspace backend. USB ID aliases are only enabled when they match
the implemented chipset path. Do not infer distance or direction from RSSI.

## Checks completed on 2026-10-17

- Android build and lint passed; 63 unit tests passed.
- Native libraries built for ARM64, ARMv7 and x86-64 with 16 KiB ELF page alignment.
- Version 0.5.0 installed over 0.4.3 on the Moto g 5G (2024), preserving app data.
- On-phone instrumentation passed native loading, firmware extraction, invalid USB
  descriptor rejection and repeated close / reopen. Its temporary test APK was removed.
- Six JavaScript node-ingestion checks and 15 Python node checks passed, including
  the new USB NAN transport and retention of the original observation timestamp.
- Panda frame reception was subsequently confirmed with 0.5.1 (below). Alfa
  reception remains pending. Version 0.5.1 is the release containing the Connect fix.

## Connect menu update: 0.5.1

- Every phone uses the same visible selector and **Connect / Refresh / Cancel** buttons.
- Android permission is requested explicitly; already-granted access starts the receiver.
- Denial offers a retry, and a detached adapter cannot be opened from an old selection.
- Twelve offline Robolectric checks passed across API 28 and 35.
- Updated Java compiled and the APK was packaged with Android SDK tools, signed with
  the existing release key, and passed signature / 16 KiB zip-alignment verification.
- User-supplied phone photos on 2026-10-17 confirm 0.5.1 installed on the Moto g 5G
  (2024), Android 14 / API 34. USB permission is granted for 0e8d:7610 / MT7610U.
- The live USB status reports **9,192 received frames**, channel 52, and **0 Remote ID**.
  This confirms real USB frame reception on this phone / adapter combination. It
  does not yet validate Remote ID decoding, every channel, or other phone models.
- A WiFi CAM candidate is visible in the local list, but these photos do not
  establish whether it arrived through the USB adapter or the phone radio.
  Sharing is off in the photos; no website upload is demonstrated by this test.
- Before publication, the standard Gradle release build, Android lint and all 75
  Android tests passed. All 46 JavaScript tests and 15 Python node tests passed.
  The published APK is the exact signed 0.5.1 file tested on the Moto.
